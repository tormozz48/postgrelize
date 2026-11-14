import type { PoolConfig } from 'pg';
import {
  createConnectionManager,
  type ConnectionManager,
  type ExecuteOptions,
  type QueryResult,
} from './connection/executor.ts';
import {
  connectionConfig,
  parseConstructorArgs,
  poolConfig,
  type ConnectionConfig,
  type SequelizeOptions,
} from './connection/options.ts';
import { DataTypes } from './data-types/data-types.ts';
import {
  addHook,
  hasHook,
  hooksFromOption,
  removeHook,
  runHooks,
  type HookFunction,
  type HookRegistry,
} from './hooks/hooks.ts';
import { cast, col, fn, json, literal, where, type Literal } from './expressions/methods.ts';
import { Op } from './expressions/op.ts';
import { Model, parseModelRow } from './model/model.ts';
import type { AnyModel, InitOptions, ModelStatic } from './model/options.ts';
import type { ModelAttributes } from './model/definition.ts';
import { runtimeKey, type ModelRuntime, type QueryOptionsBase } from './model/runtime.ts';
import { prepareRawQuery, type BindParameters, type Replacements } from './query/raw-query.ts';
import type { CompiledQuery } from './sql/compile.ts';
import {
  currentTransaction,
  runManagedTransaction,
  Transaction,
  type TransactionOptions,
} from './transaction/transaction.ts';

/** Query types of `sequelize.query` (Sequelize v6 `QueryTypes`). */
export const QueryTypes = {
  /** Returns rows. */
  SELECT: 'SELECT',
  /** Returns `[rows, rowCount]`. */
  INSERT: 'INSERT',
  /** Returns `[rows, rowCount]`. */
  UPDATE: 'UPDATE',
  /** Returns `[rows, rowCount]`. */
  UPSERT: 'UPSERT',
  /** Returns nothing. */
  DELETE: 'DELETE',
  /** Returns nothing. */
  BULKUPDATE: 'BULKUPDATE',
  /** Returns nothing. */
  BULKDELETE: 'BULKDELETE',
  /** Returns `[rows, result]` (default). */
  RAW: 'RAW',
  /** Returns `[rows, result]`. */
  SHOWTABLES: 'SHOWTABLES',
  /** Returns `[rows, result]`. */
  DESCRIBE: 'DESCRIBE',
  /** Returns `[rows, result]`. */
  VERSION: 'VERSION',
  /** Returns `[rows, result]`. */
  FOREIGNKEYS: 'FOREIGNKEYS',
  /** Returns `[rows, result]`. */
  SHOWINDEXES: 'SHOWINDEXES',
} as const;

/** One of {@link QueryTypes}. */
export type QueryType = (typeof QueryTypes)[keyof typeof QueryTypes];

/** Options of `sequelize.query`. */
export type QueryOptions = QueryOptionsBase &
  Readonly<{
    /** Shapes the result; default `RAW`. */
    type?: QueryType;
    /** Values for `?` / `:name` placeholders; bound as parameters. */
    replacements?: Replacements;
    /** Values for `$1` / `$name` placeholders. */
    bind?: BindParameters;
    /** Return only the first row (or `null`). */
    plain?: boolean;
    /** Build instances of this model from SELECT rows. */
    model?: ModelStatic<AnyModel>;
    /** Map column names to attribute names of `model`. */
    mapToModel?: boolean;
    /** Return plain rows even with `model`. */
    raw?: boolean;
  }>;

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

  /** Normalized constructor options. */
  readonly options: SequelizeOptions;
  /** Connection settings. */
  readonly config: ConnectionConfig;
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
    this.options = parseConstructorArgs(args as Parameters<typeof parseConstructorArgs>[0]);
    this.config = connectionConfig(this.options);
    const logging = this.options.logging === undefined ? console.log : this.options.logging;
    const defaults: ExecuteOptions = {
      logging,
      ...(this.options.benchmark === undefined ? {} : { benchmark: this.options.benchmark }),
    };
    this.#hooks = hooksFromOption(this.options.hooks);
    const pool = poolConfig(this.options);
    this.#connections = createConnectionManager(
      { ...pool, password: () => this.#connectPassword(pool.password) },
      defaults,
    );
    this.#runtime = {
      execute: (query, options) => this.#execute(query, options),
      transaction: (run, parent) =>
        this.transaction(
          parent === undefined || parent === null ? {} : { transaction: parent },
          run,
        ),
      register: (name, model) => {
        this.models[name] = model as ModelStatic<AnyModel>;
      },
      hooks: () => this.#hooks,
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
        ? addHook(this.#hooks, type, hook ?? missingHook(), nameOrFn)
        : addHook(this.#hooks, type, nameOrFn);
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
    this.#hooks = removeHook(this.#hooks, type, nameOrFn);
    return this;
  }

  /**
   * Checks whether hooks of the type are registered.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   */
  hasHook(type: string): boolean {
    return hasHook(this.#hooks, type);
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
    if (!hasHook(this.#hooks, 'beforeConnect')) {
      return password;
    }
    const config = { ...this.config, password };
    await runHooks([this.#hooks], 'beforeConnect', this, config);
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
   *
   * @param sql - SQL text, or a literal.
   * @param options - Query options.
   * @returns Shaped according to `options.type`, like Sequelize v6.
   */
  async query(sql: string | Literal, options: QueryOptions = {}): Promise<unknown> {
    const text = typeof sql === 'string' ? sql : sql.val;
    const prepared = prepareRawQuery(text, {
      ...(options.replacements === undefined ? {} : { replacements: options.replacements }),
      ...(options.bind === undefined ? {} : { bind: options.bind }),
    });
    const result = await this.#execute(prepared, options);
    return shapeResult(result, options);
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
        ? currentTransaction()
        : options.transaction;
    const transaction = new Transaction(this.#connections, {
      ...options,
      ...(parent === undefined ? {} : { transaction: parent }),
    });
    return run === undefined ? transaction.begin() : runManagedTransaction(transaction, run);
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
    await this.#connections.close();
  }

  #execute(query: CompiledQuery, options: QueryOptionsBase): Promise<QueryResult> {
    const transaction =
      options.transaction === undefined
        ? Sequelize.#cls
          ? currentTransaction()
          : undefined
        : (options.transaction ?? undefined);
    return this.#connections.execute(query, {
      ...(transaction === undefined ? {} : transaction.executeOptions()),
      ...(options.logging === undefined ? {} : { logging: options.logging }),
      ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
    });
  }
}

const shapeRows = (result: QueryResult, options: QueryOptions): readonly unknown[] => {
  const model = options.model;
  if (model === undefined || options.raw === true) {
    return result.rows;
  }
  return result.rows.map((row) =>
    model.build(options.mapToModel === true ? parseModelRow(model, row) : row, {
      isNewRecord: false,
      raw: true,
    }),
  );
};

const effectiveType = (options: QueryOptions): QueryType | undefined =>
  options.type ??
  (options.model !== undefined || options.plain === true ? QueryTypes.SELECT : undefined);

const shapeResult = (result: QueryResult, options: QueryOptions): unknown => {
  const rows = shapeRows(result, options);
  switch (effectiveType(options)) {
    case QueryTypes.SELECT:
      return options.plain === true ? (rows[0] ?? null) : rows;
    case QueryTypes.INSERT:
    case QueryTypes.UPDATE:
    case QueryTypes.UPSERT:
      return [rows, result.rowCount];
    case QueryTypes.DELETE:
    case QueryTypes.BULKDELETE:
    case QueryTypes.BULKUPDATE:
      return result.rowCount;
    default:
      return options.plain === true ? (rows[0] ?? null) : [rows, result];
  }
};

const missingHook = (): never => {
  throw new Error('addHook: hook function is required');
};
