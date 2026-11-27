import type { ConnectionConfig } from '../connection/connection-config.ts';
import { ConnectHooks } from '../connection/connect-hooks.ts';
import { ConnectionManager } from '../connection/connection-manager.ts';
import type { ExecuteOptions, QueryResult } from '../connection/connection-types.ts';
import { NotificationListener, type NotificationHandler } from '../connection/notifications.ts';
import type {
  ConnectionConfig as ConnectionSettings,
  SequelizeOptions,
} from '../connection/options.ts';
import { QueryLogger } from '../connection/query-logger.ts';
import { RetryRunner } from '../connection/retry.ts';
import { PgErrorMapper } from '../errors/map-pg-error.ts';
import { HookRegistry } from '../hooks/hooks.ts';
import type { ModelAttributes, ModelDefinition } from '../model/model-definition.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import { UniqueMessages } from '../model/unique-messages.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { ModelRuntime, QueryOptionsBase } from '../model/runtime.ts';
import { RawQuery, ROUTED_QUERY } from '../query/raw-query.ts';
import type { QueryInterface } from '../query-interface/query-interface.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { Transaction, TransactionOptions } from '../transaction/transaction.ts';
import { transactionScope } from '../transaction/transaction-runner.ts';
import { TransactionStarter } from '../transaction/transaction-starter.ts';

const rawQuery = new RawQuery();

const registry = new ModelRegistry();

const uniqueMessages = new UniqueMessages();

/** What the internals need from the owning `Sequelize` instance. */
export type InternalsOwner = Readonly<{
  models: Record<string, ModelStatic<AnyModel>>;
  config: ConnectionSettings;
  define: (name: string, attributes: ModelAttributes, options?: Record<string, unknown>) => object;
  getQueryInterface: () => QueryInterface;
  query: (sql: string, options: object) => Promise<unknown>;
}>;

/**
 * State and services behind a `Sequelize` instance: hooks, connections, query execution,
 * transactions, notifications and the runtime handed to models.
 *
 * @internal
 */
export class SequelizeInternals {
  /** Hooks registered on the instance. */
  hooks: HookRegistry;
  /** Pools of the instance. */
  readonly connections: ConnectionManager;
  /** Schema API, created on first use. */
  queryInterface: QueryInterface | undefined;
  /** Services provided to models. */
  readonly runtime: ModelRuntime;
  readonly #owner: InternalsOwner;
  readonly #options: SequelizeOptions;
  readonly #retries: RetryRunner;
  readonly #transactions: TransactionStarter;
  #serverVersion: Promise<number> | undefined;
  #notifier: NotificationListener | undefined;

  /**
   * @param owner - The `Sequelize` instance.
   * @param connectionConfig - Normalized connection configuration.
   */
  constructor(owner: InternalsOwner, connectionConfig: ConnectionConfig) {
    this.#owner = owner;
    this.#options = connectionConfig.options;
    this.hooks = HookRegistry.fromOption(connectionConfig.options.hooks);
    this.connections = this.#createConnections(connectionConfig);
    this.#retries = new RetryRunner(connectionConfig.options.retry);
    this.#transactions = new TransactionStarter(this.connections, this.#retries);
    this.runtime = this.#createRuntime(connectionConfig.options);
  }

  /**
   * Makes `sequelize.options.hooks = {...}` replace the global hooks, as in v6 (tests and apps reset them that way).
   *
   * @param options - The `options` object of the instance.
   */
  watchOptionHooks(options: SequelizeOptions): void {
    let current = options.hooks;
    Object.defineProperty(options, 'hooks', {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (value: SequelizeOptions['hooks']) => {
        current = value;
        this.hooks = HookRegistry.fromOption(value);
      },
    });
  }

  /**
   * Runs a compiled query on the pool or transaction the options select.
   *
   * @param query - Query text and values.
   * @param options - Transaction, logging and routing options.
   * @param kind - `'read'` queries may run on a replica.
   * @returns Query result.
   */
  execute(
    query: CompiledQuery,
    options: QueryOptionsBase,
    kind: 'read' | 'write' = 'write',
  ): Promise<QueryResult> {
    const finished = SequelizeInternals.#finishedTransaction(query, options);
    if (finished !== undefined) {
      return Promise.reject(finished);
    }
    const settings = this.executeOptions(options, kind);
    // A statement inside a transaction is never retried: PostgreSQL has aborted the transaction.
    const run = (): Promise<QueryResult> => this.connections.execute(query, settings);
    const result =
      settings.client === undefined && this.#retries.active(options.retry)
        ? this.#retries.run(run, options.retry)
        : run();
    return result.catch((error: unknown) => {
      throw uniqueMessages.apply(error, () => this.#definitions());
    });
  }

  #definitions(): readonly ModelDefinition[] {
    return Object.values(this.#owner.models).map((model) => registry.definition(model));
  }

  // A query on a transaction that was committed or rolled back is rejected with the v6 message and `sql`.
  static #finishedTransaction(query: CompiledQuery, options: QueryOptionsBase): Error | undefined {
    const transaction = options.transaction;
    if (transaction?.finished === undefined) {
      return undefined;
    }
    return Object.assign(
      new Error(
        `${transaction.finished} has been called on this transaction(${transaction.id}), you can no longer use it. (The rejected query is attached as the 'sql' property of this error)`,
      ),
      { sql: query.text },
    );
  }

  /**
   * Resolves the transaction, replica route and logging of one query.
   *
   * @param options - Query options.
   * @param kind - `'read'` queries may run on a replica.
   * @returns Connection manager execute options.
   */
  executeOptions(options: QueryOptionsBase, kind: 'read' | 'write' = 'write'): ExecuteOptions {
    const transaction =
      options.transaction === undefined
        ? transactionScope.active()
        : (options.transaction ?? undefined);
    return {
      ...(transaction === undefined ? {} : transaction.executeOptions()),
      ...(transaction === undefined && kind === 'read' && options.useMaster !== true
        ? { route: 'read' as const }
        : {}),
      ...this.#searchPath(options),
      ...((options as ExecuteOptions).rawErrors === true ? { rawErrors: true } : {}),
      ...(options.logging === undefined ? {} : { logging: options.logging }),
      ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
      ...(options.statementTimeout === undefined
        ? {}
        : { statementTimeout: options.statementTimeout }),
    };
  }

  // like v6, ignored without `dialectOptions.prependSearchPath`
  #searchPath(options: QueryOptionsBase): { searchPath?: string } {
    const { dialectOptions, searchPath } = this.#options;
    const path = options.searchPath || searchPath;
    return dialectOptions?.prependSearchPath === true && path && path !== 'DEFAULT'
      ? { searchPath: path }
      : {};
  }

  /**
   * Starts an unmanaged transaction.
   *
   * @param options - Transaction options.
   * @returns Started transaction.
   */
  begin(options: TransactionOptions = {}): Promise<Transaction> {
    return this.#transactions.begin(options);
  }

  /**
   * Runs `run` in a managed transaction.
   *
   * @param options - Transaction options.
   * @param run - Callback receiving the transaction.
   * @returns Result of `run`.
   */
  managed<T>(
    options: TransactionOptions,
    run: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.#transactions.managed(options, run);
  }

  /**
   * Subscribes to a `NOTIFY` channel.
   *
   * @param channel - Channel name.
   * @param handler - Notification handler.
   * @returns Function that unsubscribes the handler.
   */
  listen(channel: string, handler: NotificationHandler): Promise<() => Promise<void>> {
    this.#notifier ??= new NotificationListener(() => this.connections.dedicated());
    return this.#notifier.listen(channel, handler);
  }

  /**
   * Closes the notification connection and all pools.
   *
   * @returns Resolves when closed.
   */
  async close(): Promise<void> {
    await this.#notifier?.close();
    await this.connections.close();
  }

  #createConnections(connectionConfig: ConnectionConfig): ConnectionManager {
    const { options } = connectionConfig;
    const pools = connectionConfig.replicationPoolConfigs();
    const hooks = new ConnectHooks(() => this.hooks, this.#owner);
    return new ConnectionManager(
      hooks.apply(pools.write),
      pools.read.map((config) => hooks.apply(config)),
      QueryLogger.fromOptions(options),
      new PgErrorMapper(),
      options.statementCache,
      hooks,
    );
  }

  #createRuntime(options: SequelizeOptions): ModelRuntime {
    return {
      ...this.#queryRuntime(),
      ...this.#modelRuntime(),
      beginTransaction: (transactionOptions) => this.begin(transactionOptions),
      transaction: (run, parent) =>
        this.managed(parent === undefined || parent === null ? {} : { transaction: parent }, run),
      defaults: {
        ...options.define,
        ...(options.typeValidation === true ? { typeValidation: true } : {}),
      },
      inAsAnyThreshold: options.inAsAnyThreshold,
      minifyAliases: options.minifyAliases,
    };
  }

  #queryRuntime(): Pick<ModelRuntime, 'execute' | 'copyFrom' | 'copyTo' | 'serverVersion'> {
    return {
      // Through `sequelize.query` (like v6), so a wrapper or override of it sees the SQL of every model
      // query; the routed marker makes `query` run the statement as it is and return the driver result.
      execute: (query, options, kind = 'write') => {
        const injected = rawQuery.inject(query, options.replacements);
        return this.#owner.query(injected.text, {
          ...options,
          bind: injected.values,
          [ROUTED_QUERY]: kind,
        }) as Promise<QueryResult>;
      },
      copyFrom: (text, lines, options) =>
        this.connections.copyFrom(text, lines, this.executeOptions(options)),
      copyTo: (text, options, kind) =>
        this.connections.copyTo(text, this.executeOptions(options, kind)),
      serverVersion: () => this.#serverVersionNumber(),
    };
  }

  #modelRuntime(): Pick<
    ModelRuntime,
    'register' | 'hooks' | 'defineModel' | 'models' | 'queryInterface'
  > {
    return {
      register: (name, model) => {
        this.#owner.models[name] = model as ModelStatic<AnyModel>;
      },
      hooks: () => this.hooks,
      defineModel: (name, attributes, options) =>
        this.#owner.define(name, attributes as ModelAttributes, options),
      models: () => this.#owner.models,
      queryInterface: () => this.#owner.getQueryInterface(),
    };
  }

  #serverVersionNumber(): Promise<number> {
    this.#serverVersion ??= this.execute({ text: 'SHOW server_version_num', values: [] }, {}).then(
      (result) => Number(result.rows[0]?.['server_version_num'] ?? 0),
    );
    return this.#serverVersion;
  }
}
