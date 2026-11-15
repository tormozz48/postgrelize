import type { PoolConfig } from 'pg';
import type { ConnectionConfig } from '../connection/connection-config.ts';
import { ConnectionManager } from '../connection/connection-manager.ts';
import type { ExecuteOptions, QueryResult } from '../connection/connection-types.ts';
import { NotificationListener, type NotificationHandler } from '../connection/notifications.ts';
import type {
  ConnectionConfig as ConnectionSettings,
  SequelizeOptions,
} from '../connection/options.ts';
import { QueryLogger } from '../connection/query-logger.ts';
import { PgErrorMapper } from '../errors/map-pg-error.ts';
import { HookRegistry } from '../hooks/hooks.ts';
import type { ModelAttributes } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { ModelRuntime, QueryOptionsBase } from '../model/runtime.ts';
import type { QueryInterface } from '../query-interface/query-interface.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { Transaction, TransactionOptions } from '../transaction/transaction.ts';
import { transactionScope } from '../transaction/transaction-runner.ts';
import { TransactionStarter } from '../transaction/transaction-starter.ts';

/** What the internals need from the owning `Sequelize` instance. */
export type InternalsOwner = Readonly<{
  models: Record<string, ModelStatic<AnyModel>>;
  config: ConnectionSettings;
  define: (name: string, attributes: ModelAttributes, options?: Record<string, unknown>) => object;
  getQueryInterface: () => QueryInterface;
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
  /** Services provided to models. */
  readonly runtime: ModelRuntime;
  readonly #owner: InternalsOwner;
  readonly #transactions: TransactionStarter;
  #serverVersion: Promise<number> | undefined;
  #notifier: NotificationListener | undefined;

  /**
   * @param owner - The `Sequelize` instance.
   * @param connectionConfig - Normalized connection configuration.
   */
  constructor(owner: InternalsOwner, connectionConfig: ConnectionConfig) {
    this.#owner = owner;
    this.hooks = HookRegistry.fromOption(connectionConfig.options.hooks);
    this.connections = this.#createConnections(connectionConfig);
    this.#transactions = new TransactionStarter(this.connections);
    this.runtime = this.#createRuntime(connectionConfig.options);
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
    return this.connections.execute(query, this.executeOptions(options, kind));
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
      ...(options.logging === undefined ? {} : { logging: options.logging }),
      ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
    };
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
    const withHookPassword = (config: PoolConfig): PoolConfig => ({
      ...config,
      password: () => this.#connectPassword(config.password),
    });
    const defaults: ExecuteOptions = {
      logging: options.logging === undefined ? console.log : options.logging,
      ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
    };
    return new ConnectionManager(
      withHookPassword(pools.write),
      pools.read.map(withHookPassword),
      new QueryLogger(defaults),
      new PgErrorMapper(),
    );
  }

  async #connectPassword(configured: PoolConfig['password']): Promise<string> {
    const password = typeof configured === 'function' ? await configured() : (configured ?? '');
    if (!this.hooks.has('beforeConnect')) {
      return password;
    }
    const config = { ...this.#owner.config, password };
    await this.hooks.run('beforeConnect', this.#owner, config);
    return config.password ?? '';
  }

  #createRuntime(options: SequelizeOptions): ModelRuntime {
    return {
      ...this.#queryRuntime(),
      ...this.#modelRuntime(),
      beginTransaction: (transactionOptions) => this.begin(transactionOptions),
      transaction: (run, parent) =>
        this.managed(parent === undefined || parent === null ? {} : { transaction: parent }, run),
      defaults: options.define ?? {},
      inAsAnyThreshold: options.inAsAnyThreshold,
    };
  }

  #queryRuntime(): Pick<ModelRuntime, 'execute' | 'copyFrom' | 'copyTo' | 'serverVersion'> {
    return {
      execute: (query, options, kind) => this.execute(query, options, kind),
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
