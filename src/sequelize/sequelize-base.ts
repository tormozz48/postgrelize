import { ModelDecorators } from '../decorators/model-decorators.ts';
import { ConnectionConfig } from '../connection/connection-config.ts';
import type {
  ConnectionConfig as ConnectionSettings,
  SequelizeOptions,
} from '../connection/options.ts';
import { cast, col, fn, json, literal, where, type Literal } from '../expressions/methods.ts';
import { Model } from '../model/model.ts';
import type { ModelAttributes } from '../model/model-definition.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { AnyModel, InitOptions, ModelStatic } from '../model/options.ts';
import {
  runtimeKey,
  type ModelRuntime,
  type QueryOptionsBase,
  type RuntimeOwner,
} from '../model/runtime.ts';
import { QueryResultShaper, QueryTypes, type QueryOptions } from '../query/query-result-shaper.ts';
import { RawQuery } from '../query/raw-query.ts';
import { QueryInterface } from '../query-interface/query-interface.ts';
import { RowMapper } from '../model/row-mapper.ts';
import { SequelizeInternals } from './sequelize-internals.ts';

const decorators = new ModelDecorators();
const rawQuery = new RawQuery();
const resultShaper = new QueryResultShaper(new RowMapper(new ModelRegistry()));

/**
 * Options of `sequelize.define`: the model options of `Model.init` without `sequelize`.
 *
 * @example
 * ```ts
 * const options: DefineOptions = { tableName: 'products', timestamps: false, paranoid: false };
 * const Product = sequelize.define('Product', { sku: DataTypes.STRING }, options);
 * ```
 */
export type DefineOptions = Omit<InitOptions, 'sequelize'>;

/**
 * Core of `Sequelize`: options, models, query execution and connection lifecycle. The remaining
 * capabilities are added by the `Sequelize` mixins; `Sequelize` is the public class.
 *
 * @internal
 */
export class SequelizeBase {
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
  /** @internal */
  readonly internals: SequelizeInternals;

  /**
   * @param args - Connection URI, or database / username / password, followed by options.
   */
  constructor(...args: readonly unknown[]) {
    const connectionConfig = new ConnectionConfig(
      args as ConstructorParameters<typeof ConnectionConfig>[0],
    );
    this.options = connectionConfig.options;
    this.config = connectionConfig.settings();
    this.internals = new SequelizeInternals(this, connectionConfig);
  }

  /**
   * Reports the SQL dialect of this instance; postgrelize supports PostgreSQL only.
   *
   * @returns Always `'postgres'`.
   *
   * @example
   * ```ts
   * sequelize.getDialect(); // 'postgres'
   * ```
   */
  getDialect(): 'postgres' {
    return 'postgres';
  }

  /**
   * Defines a model without declaring a class, like `Model.init` on an anonymous subclass named `modelName`.
   * The model is registered in `sequelize.models`.
   *
   * @param modelName - Model name.
   * @param attributes - Attribute definitions keyed by attribute name.
   * @param options - Model options (`sequelize` is set for you).
   * @returns The model class.
   * @see {@link Model.init}
   *
   * @example
   * ```ts
   * const Product = sequelize.define('Product', {
   *   sku: { type: DataTypes.STRING, allowNull: false, unique: true },
   *   price: DataTypes.DECIMAL(10, 2),
   * });
   * await Product.sync();
   * ```
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
      sequelize: this as unknown as RuntimeOwner,
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
    decorators.register(this as unknown as RuntimeOwner, models);
    return this;
  }

  /**
   * Looks up a model registered with `define`, `Model.init` or `addModels`.
   *
   * @param modelName - Model name.
   * @returns The model class.
   * @throws Error when the model is not defined.
   *
   * @example
   * ```ts
   * const Product = sequelize.model('Product');
   * const total = await Product.count();
   * ```
   */
  model(modelName: string): ModelStatic<AnyModel> {
    const model = this.models[modelName];
    if (model === undefined) {
      throw new Error(`${modelName} has not been defined`);
    }
    return model;
  }

  /**
   * Tells whether a model with the given name is registered on this instance.
   *
   * @param modelName - Model name.
   * @returns True when defined.
   *
   * @example
   * ```ts
   * if (!sequelize.isDefined('Product')) {
   *   sequelize.define('Product', { sku: DataTypes.STRING });
   * }
   * ```
   */
  isDefined(modelName: string): boolean {
    return modelName in this.models;
  }

  /**
   * Runs a raw SQL statement and shapes the result by `options.type`. Replacements are bound as parameters (never inlined).
   * The SQL text itself is sent as is: never build it from user input — pass user values through
   * `replacements` or `bind`.
   *
   * @param sql - SQL text, or a literal.
   * @param options - Query options.
   * @returns Shaped according to `options.type`, like Sequelize v6.
   * @throws DatabaseError subclasses mapped from the PostgreSQL error (unique violation, foreign key violation, ...).
   * @see {@link QueryTypes}
   *
   * @example
   * ```ts
   * const rows = await sequelize.query('SELECT id, name FROM users WHERE name = :name', {
   *   type: QueryTypes.SELECT,
   *   replacements: { name: 'Ada' },
   * });
   * ```
   */
  async query(sql: string | Literal, options: QueryOptions = {}): Promise<unknown> {
    const text = typeof sql === 'string' ? sql : sql.val;
    const prepared = rawQuery.prepare(text, {
      ...(options.replacements === undefined ? {} : { replacements: options.replacements }),
      ...(options.bind === undefined ? {} : { bind: options.bind }),
    });
    const kind = resultShaper.type(options) === QueryTypes.SELECT ? 'read' : 'write';
    return resultShaper.shape(await this.internals.execute(prepared, options, kind), options);
  }

  /**
   * Returns the schema manipulation API of this instance (used by migrations). The instance is created on first use and then reused.
   *
   * @returns The QueryInterface of this instance.
   *
   * @example
   * ```ts
   * const queryInterface = sequelize.getQueryInterface();
   * await queryInterface.dropTable('legacy_logs');
   * ```
   */
  getQueryInterface(): QueryInterface {
    this.internals.queryInterface ??= new QueryInterface(this as unknown as RuntimeOwner);
    return this.internals.queryInterface;
  }

  /**
   * Verifies that the database is reachable by running `SELECT 1+1 AS result`.
   *
   * @param options - Query options.
   * @returns Resolves when the database is reachable.
   * @throws ConnectionError and its subclasses when the connection cannot be established.
   *
   * @example
   * ```ts
   * try {
   *   await sequelize.authenticate();
   * } catch (error) {
   *   console.error('Database unreachable', error);
   * }
   * ```
   */
  async authenticate(options: QueryOptionsBase = {}): Promise<void> {
    await this.internals.execute({ text: 'SELECT 1+1 AS result', values: [] }, options);
  }

  /**
   * Reads the PostgreSQL server version with `SHOW server_version`, e.g. `'16.4'`.
   *
   * @param options - Query options.
   * @returns Version string.
   *
   * @example
   * ```ts
   * const version = await sequelize.databaseVersion(); // e.g. '17.2'
   * ```
   */
  async databaseVersion(options: QueryOptionsBase = {}): Promise<string> {
    const query = { text: 'SHOW server_version', values: [] };
    const result = await this.internals.execute(query, options);
    return String(result.rows[0]?.['server_version'] ?? '').split(' ')[0] ?? '';
  }

  /**
   * Closes all pooled connections and stops the notification listener. The instance cannot run queries afterwards.
   *
   * @returns Resolves when closed.
   *
   * @example
   * ```ts
   * await sequelize.close();
   * ```
   */
  async close(): Promise<void> {
    await this.internals.close();
  }
}

// The services models use are reached through `RuntimeOwner` (declared on `Sequelize`).
Object.defineProperty(SequelizeBase.prototype, runtimeKey, {
  get(this: SequelizeBase): ModelRuntime {
    return this.internals.runtime;
  },
});
