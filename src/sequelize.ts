import type { PoolConfig } from 'pg';
import { ModelDecorators } from './decorators/model-decorators.ts';
import { ConnectionConfig } from './connection/connection-config.ts';
import {
  ConnectionManager,
  type ExecuteOptions,
  type QueryResult,
} from './connection/connection-manager.ts';
import type {
  ConnectionConfig as ConnectionSettings,
  SequelizeOptions,
} from './connection/options.ts';
import { QueryLogger } from './connection/query-logger.ts';
import { DataTypes } from './data-types/data-types.ts';
import { NotificationListener, type NotificationHandler } from './connection/notifications.ts';
import { PgErrorMapper } from './errors/map-pg-error.ts';
import { HookRegistry, type HookFunction } from './hooks/hooks.ts';
import { cast, col, fn, json, literal, where, type Literal } from './expressions/methods.ts';
import { Op } from './expressions/op.ts';
import { Model } from './model/model.ts';
import { ModelRegistry } from './model/model-registry.ts';
import { QueryInterface } from './query-interface/query-interface.ts';
import {
  SchemaSynchronizer,
  type DropOptions,
  type SyncOptions,
} from './query-interface/schema-synchronizer.ts';
import type { AnyModel, InitOptions, ModelStatic } from './model/options.ts';
import type { ModelAttributes } from './model/model-definition.ts';
import { runtimeKey, type ModelRuntime, type QueryOptionsBase } from './model/runtime.ts';
import { RawQuery } from './query/raw-query.ts';
import { QueryResultShaper, QueryTypes, type QueryOptions } from './query/query-result-shaper.ts';
import { RowMapper } from './model/row-mapper.ts';
import type { CompiledQuery } from './sql/compile.ts';
import {
  Transaction,
  TransactionContext,
  TransactionRunner,
  type AdvisoryLockKey,
  type TransactionOptions,
} from './transaction/transaction.ts';

export { QueryTypes } from './query/query-result-shaper.ts';
export type { QueryOptions, QueryType } from './query/query-result-shaper.ts';

const decorators = new ModelDecorators();
const rawQuery = new RawQuery();
const registry = new ModelRegistry();
const resultShaper = new QueryResultShaper(new RowMapper(registry));

/** Options of `sequelize.define`. */
export type DefineOptions = Omit<InitOptions, 'sequelize'>;

/**
 * Entry point, API-compatible with Sequelize v6 `Sequelize` for PostgreSQL.
 *
 * @example
 * ```ts
 * const sequelize = new Sequelize('postgres://user:pass@localhost:5432/app', { logging: false });
 * ```
 */
export class Sequelize {
  /** Column types. */
  static readonly DataTypes = DataTypes;
  /** Query operators. */
  static readonly Op: typeof Op = Op;
  /** Query types. */
  static readonly QueryTypes = QueryTypes;
  /** Transaction class. */
  static readonly Transaction = Transaction;
  /** Model base class. */
  static readonly Model = Model;
  /** Raw SQL fragment builder. */
  static readonly literal = literal;
  /** SQL function call builder. */
  static readonly fn = fn;
  /** Column reference builder. */
  static readonly col = col;
  /** Type cast builder. */
  static readonly cast = cast;
  /** Comparison builder. */
  static readonly where = where;
  /** JSON path builder. */
  static readonly json = json;

  static #cls = false;
  static readonly #context = new TransactionContext();
  static readonly #transactions = new TransactionRunner(Sequelize.#context);

  /** Normalized constructor options. */
  readonly options: SequelizeOptions;
  /** Connection settings. */
  readonly config: ConnectionSettings;
  /** Models registered with `define` / `Model.init`, by model name. */
  readonly models: Record<string, ModelStatic<AnyModel>> = {};
  /** Raw SQL fragment builder. */
  readonly literal = literal;
  /** SQL function call builder. */
  readonly fn = fn;
  /** Column reference builder. */
  readonly col = col;
  /** Type cast builder. */
  readonly cast = cast;
  /** Comparison builder. */
  readonly where = where;
  /** JSON path builder. */
  readonly json = json;

  readonly #connections: ConnectionManager;
  readonly #runtime: ModelRuntime;
  #hooks: HookRegistry;
  #queryInterface: QueryInterface | undefined;
  #serverVersion: Promise<number> | undefined;
  #notifier: NotificationListener | undefined;

  /**
   * Creates an instance from a connection URI.
   *
   * @param uri - `postgres://user:password@host:port/database`.
   * @param options - Options.
   */
  constructor(uri: string, options?: SequelizeOptions);
  /**
   * Creates an instance from connection parameters.
   *
   * @param database - Database name.
   * @param username - User name.
   * @param password - Password.
   * @param options - Options.
   */
  constructor(
    database: string,
    username?: string | null,
    password?: string | null,
    options?: SequelizeOptions,
  );
  /**
   * Creates an instance from options only.
   *
   * @param options - Options including connection settings.
   */
  constructor(options?: SequelizeOptions);
  constructor(...args: readonly unknown[]) {
    const connectionConfig = new ConnectionConfig(
      args as ConstructorParameters<typeof ConnectionConfig>[0],
    );
    this.options = connectionConfig.options;
    this.config = connectionConfig.settings();
    const logging = this.options.logging === undefined ? console.log : this.options.logging;
    const defaults: ExecuteOptions = {
      logging,
      ...(this.options.benchmark === undefined ? {} : { benchmark: this.options.benchmark }),
    };
    this.#hooks = HookRegistry.fromOption(this.options.hooks);
    const pools = connectionConfig.replicationPoolConfigs();
    const withHookPassword = (config: PoolConfig): PoolConfig => ({
      ...config,
      password: () => this.#connectPassword(config.password),
    });
    this.#connections = new ConnectionManager(
      withHookPassword(pools.write),
      pools.read.map(withHookPassword),
      new QueryLogger(defaults),
      new PgErrorMapper(),
    );
    this.#runtime = {
      execute: (query, options, kind) => this.#execute(query, options, kind),
      transaction: (run, parent) =>
        this.transaction(
          parent === undefined || parent === null ? {} : { transaction: parent },
          run,
        ),
      register: (name, model) => {
        this.models[name] = model as ModelStatic<AnyModel>;
      },
      hooks: () => this.#hooks,
      defineModel: (name, attributes, options) =>
        this.define(name, attributes as ModelAttributes, options as DefineOptions),
      models: () => this.models,
      queryInterface: () => this.getQueryInterface(),
      copyFrom: (text, lines, options) =>
        this.#connections.copyFrom(text, lines, this.#executeOptions(options)),
      copyTo: (text, options, kind) =>
        this.#connections.copyTo(text, this.#executeOptions(options, kind)),
      beginTransaction: (options) => this.transaction(options),
      serverVersion: () => {
        this.#serverVersion ??= this.#execute(
          { text: 'SHOW server_version_num', values: [] },
          {},
        ).then((result) => Number(result.rows[0]?.['server_version_num'] ?? 0));
        return this.#serverVersion;
      },
      defaults: this.options.define ?? {},
      inAsAnyThreshold: this.options.inAsAnyThreshold,
    };
  }

  /**
   * Enables continuation-local transactions: queries inside `sequelize.transaction(fn)` use the
   * transaction automatically. The namespace argument of Sequelize v6 is accepted and ignored;
   * `AsyncLocalStorage` is used instead.
   *
   * @param _namespace - Ignored.
   * @returns The `Sequelize` class.
   */
  static useCLS(_namespace?: unknown): typeof Sequelize {
    Sequelize.#cls = true;
    return Sequelize;
  }

  /**
   * Adds a hook run for every model (or `beforeConnect`).
   *
   * @param type - Hook type, e.g. `'beforeCreate'`.
   * @param nameOrFn - Hook name (to remove it later) or the hook function.
   * @param hook - Hook function when a name is given.
   * @returns This instance.
   */
  addHook(type: string, nameOrFn: string | HookFunction, hook?: HookFunction): this {
    this.#hooks =
      typeof nameOrFn === 'string'
        ? this.#hooks.add(type, hook ?? Sequelize.#missingHook(), nameOrFn)
        : this.#hooks.add(type, nameOrFn);
    return this;
  }

  /**
   * Removes hooks by name or function.
   *
   * @param type - Hook type.
   * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
   * @returns This instance.
   */
  removeHook(type: string, nameOrFn?: string | HookFunction): this {
    this.#hooks = this.#hooks.remove(type, nameOrFn);
    return this;
  }

  /**
   * Checks whether hooks of the type are registered.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   */
  hasHook(type: string): boolean {
    return this.#hooks.has(type);
  }

  /**
   * Alias of {@link Sequelize.hasHook}.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   */
  hasHooks(type: string): boolean {
    return this.hasHook(type);
  }

  async #connectPassword(configured: PoolConfig['password']): Promise<string> {
    const password = typeof configured === 'function' ? await configured() : (configured ?? '');
    if (!this.#hooks.has('beforeConnect')) {
      return password;
    }
    const config = { ...this.config, password };
    await this.#hooks.run('beforeConnect', this, config);
    return config.password ?? '';
  }

  /** @internal */
  get [runtimeKey](): ModelRuntime {
    return this.#runtime;
  }

  /**
   * Dialect name.
   *
   * @returns Always `'postgres'`.
   */
  getDialect(): 'postgres' {
    return 'postgres';
  }

  /**
   * Defines a model without declaring a class.
   *
   * @param modelName - Model name.
   * @param attributes - Attribute definitions.
   * @param options - Model options.
   * @returns The model class.
   */
  define<M extends AnyModel = Model>(
    modelName: string,
    attributes: ModelAttributes,
    options: DefineOptions = {},
  ): ModelStatic<M> {
    const DefinedModel = { [modelName]: class extends Model {} }[
      modelName
    ] as unknown as ModelStatic<M>;
    return DefinedModel.init(attributes, {
      ...options,
      modelName,
      sequelize: this,
    }) as ModelStatic<M>;
  }

  /**
   * Registers model classes defined with decorators (`@Table`, `@Column`, `@HasMany`, …): initializes
   * each one like `Model.init` and then adds its associations, so classes may refer to each other
   * in any order. Pass every class of an association before using it.
   *
   * @param models - Model classes.
   * @returns This instance.
   * @example
   * ```ts
   * sequelize.addModels([User, Post]);
   * ```
   * @see {@link Table}
   */
  addModels(models: readonly ModelStatic<AnyModel>[]): this {
    decorators.register(this, models);
    return this;
  }

  /**
   * Returns a registered model.
   *
   * @param modelName - Model name.
   * @returns The model class.
   * @throws Error when the model is not defined.
   */
  model(modelName: string): ModelStatic<AnyModel> {
    const model = this.models[modelName];
    if (model === undefined) {
      throw new Error(`${modelName} has not been defined`);
    }
    return model;
  }

  /**
   * Checks whether a model is registered.
   *
   * @param modelName - Model name.
   * @returns True when defined.
   */
  isDefined(modelName: string): boolean {
    return modelName in this.models;
  }

  /**
   * Runs raw SQL. Replacements are bound as parameters (never inlined).
   * The SQL text itself is sent as is: never build it from user input — pass user values through
   * `replacements` or `bind`.
   *
   * @param sql - SQL text, or a literal.
   * @param options - Query options.
   * @returns Shaped according to `options.type`, like Sequelize v6.
   */
  async query(sql: string | Literal, options: QueryOptions = {}): Promise<unknown> {
    const text = typeof sql === 'string' ? sql : sql.val;
    const prepared = rawQuery.prepare(text, {
      ...(options.replacements === undefined ? {} : { replacements: options.replacements }),
      ...(options.bind === undefined ? {} : { bind: options.bind }),
    });
    const result = await this.#execute(
      prepared,
      options,
      resultShaper.type(options) === QueryTypes.SELECT ? 'read' : 'write',
    );
    return resultShaper.shape(result, options);
  }

  /**
   * Starts an unmanaged transaction; commit or roll it back yourself.
   *
   * @param options - Transaction options.
   * @returns Started transaction.
   */
  transaction(options?: TransactionOptions): Promise<Transaction>;
  /**
   * Runs `run` in a managed transaction: committed when it resolves, rolled back when it throws.
   *
   * @param run - Callback receiving the transaction.
   * @returns Result of `run`.
   */
  transaction<T>(run: (transaction: Transaction) => Promise<T>): Promise<T>;
  /**
   * Runs `run` in a managed transaction with options.
   *
   * @param options - Transaction options.
   * @param run - Callback receiving the transaction.
   * @returns Result of `run`.
   */
  transaction<T>(
    options: TransactionOptions,
    run: (transaction: Transaction) => Promise<T>,
  ): Promise<T>;
  async transaction<T>(
    optionsOrRun?: TransactionOptions | ((transaction: Transaction) => Promise<T>),
    maybeRun?: (transaction: Transaction) => Promise<T>,
  ): Promise<T | Transaction> {
    const options = typeof optionsOrRun === 'function' ? {} : (optionsOrRun ?? {});
    const run = typeof optionsOrRun === 'function' ? optionsOrRun : maybeRun;
    const parent =
      options.transaction === undefined && Sequelize.#cls
        ? Sequelize.#context.current()
        : options.transaction;
    const transaction = new Transaction(this.#connections, {
      ...options,
      ...(parent === undefined ? {} : { transaction: parent }),
    });
    return run === undefined ? transaction.begin() : Sequelize.#transactions.run(transaction, run);
  }

  /**
   * Schema manipulation API (used by migrations).
   *
   * @returns The QueryInterface of this instance.
   */
  getQueryInterface(): QueryInterface {
    this.#queryInterface ??= new QueryInterface(this);
    return this.#queryInterface;
  }

  /**
   * Creates a schema if it does not exist.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.getQueryInterface().createSchema(schema, options);
  }

  /**
   * Lists user schemas (without `public`, `information_schema` and `pg_*`).
   *
   * @param options - Query options.
   * @returns Schema names.
   */
  async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
    return await this.getQueryInterface().showAllSchemas(options);
  }

  /**
   * Drops a schema with everything in it.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.getQueryInterface().dropSchema(schema, options);
  }

  /**
   * Drops every user schema with everything in it.
   *
   * @param options - Query options.
   */
  async dropAllSchemas(options?: QueryOptionsBase): Promise<void> {
    await this.getQueryInterface().dropAllSchemas(options);
  }

  /**
   * Creates (or alters / re-creates) the tables of all defined models in foreign-key order.
   *
   * @param options - `force`, `alter`, `match` and query options.
   * @returns This instance.
   */
  async sync(options: SyncOptions = {}): Promise<this> {
    if (options.match !== undefined && !options.match.test(this.config.database ?? '')) {
      throw new Error(
        `Database "${this.config.database ?? ''}" does not match sync match parameter "${String(options.match)}"`,
      );
    }
    await new SchemaSynchronizer(this.#runtime, this.getQueryInterface()).syncAll(
      Object.values(this.models).map((model) => registry.definition(model)),
      options,
    );
    return this;
  }

  /**
   * Drops the tables of all defined models in reverse foreign-key order.
   *
   * @param options - `cascade` and query options.
   * @returns Resolves when done.
   */
  async drop(options: DropOptions = {}): Promise<void> {
    await new SchemaSynchronizer(this.#runtime, this.getQueryInterface()).dropAll(
      Object.values(this.models).map((model) => registry.definition(model)),
      options,
    );
  }

  /**
   * Subscribes to `NOTIFY` messages on a channel using one dedicated connection per instance (re-subscribed
   * after connection loss). PostgreSQL extension.
   *
   * @param channel - Channel name.
   * @param handler - Called with the payload and the channel.
   * @returns Function that unsubscribes the handler.
   */
  listen(channel: string, handler: NotificationHandler): Promise<() => Promise<void>> {
    this.#notifier ??= new NotificationListener(() => this.#connections.dedicated());
    return this.#notifier.listen(channel, handler);
  }

  /**
   * Sends a notification (`pg_notify`). PostgreSQL extension.
   *
   * @param channel - Channel name.
   * @param payload - Payload text (objects are sent as JSON).
   * @param options - Query options (inside a transaction the notification is sent on commit).
   * @returns Resolves when sent.
   */
  async notify(channel: string, payload?: unknown, options: QueryOptionsBase = {}): Promise<void> {
    const text =
      payload === undefined ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload);
    await this.#execute({ text: 'SELECT pg_notify($1, $2)', values: [channel, text] }, options);
  }

  /**
   * Runs `run` in a transaction holding a transaction-level advisory lock. PostgreSQL extension.
   *
   * @param key - Lock key (integer or string).
   * @param run - Callback receiving the transaction.
   * @param options - Transaction options.
   * @returns Result of `run`.
   */
  withAdvisoryLock<T>(
    key: AdvisoryLockKey,
    run: (transaction: Transaction) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    return this.transaction(options, async (transaction) => {
      await transaction.advisoryLock(key);
      return run(transaction);
    });
  }

  /**
   * Checks the connection by running `SELECT 1+1 AS result`.
   *
   * @param options - Query options.
   * @returns Resolves when the database is reachable.
   * @throws ConnectionError subclasses.
   */
  async authenticate(options: QueryOptionsBase = {}): Promise<void> {
    await this.#execute({ text: 'SELECT 1+1 AS result', values: [] }, options);
  }

  /**
   * Server version, e.g. `'16.4'`.
   *
   * @param options - Query options.
   * @returns Version string.
   */
  async databaseVersion(options: QueryOptionsBase = {}): Promise<string> {
    const result = await this.#execute({ text: 'SHOW server_version', values: [] }, options);
    return String(result.rows[0]?.['server_version'] ?? '').split(' ')[0] ?? '';
  }

  /**
   * Closes all pooled connections.
   *
   * @returns Resolves when closed.
   */
  async close(): Promise<void> {
    await this.#notifier?.close();
    await this.#connections.close();
  }

  static #missingHook(): never {
    throw new Error('addHook: hook function is required');
  }

  #executeOptions(options: QueryOptionsBase, kind: 'read' | 'write' = 'write'): ExecuteOptions {
    const transaction =
      options.transaction === undefined
        ? Sequelize.#cls
          ? Sequelize.#context.current()
          : undefined
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

  #execute(
    query: CompiledQuery,
    options: QueryOptionsBase,
    kind: 'read' | 'write' = 'write',
  ): Promise<QueryResult> {
    return this.#connections.execute(query, this.#executeOptions(options, kind));
  }
}
