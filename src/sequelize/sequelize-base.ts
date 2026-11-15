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
import { runtimeKey, type ModelRuntime, type QueryOptionsBase } from '../model/runtime.ts';
import { QueryResultShaper, QueryTypes, type QueryOptions } from '../query/query-result-shaper.ts';
import { RawQuery } from '../query/raw-query.ts';
import { QueryInterface } from '../query-interface/query-interface.ts';
import { RowMapper } from '../model/row-mapper.ts';
import { SequelizeInternals } from './sequelize-internals.ts';

const decorators = new ModelDecorators();
const rawQuery = new RawQuery();
const resultShaper = new QueryResultShaper(new RowMapper(new ModelRegistry()));

/** Options of `sequelize.define`. */
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
  #queryInterface: QueryInterface | undefined;

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

  /** @internal */
  get [runtimeKey](): ModelRuntime {
    return this.internals.runtime;
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
    decorators.register(this as unknown as RuntimeOwner, models);
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
    const kind = resultShaper.type(options) === QueryTypes.SELECT ? 'read' : 'write';
    return resultShaper.shape(await this.internals.execute(prepared, options, kind), options);
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
   * Checks the connection by running `SELECT 1+1 AS result`.
   *
   * @param options - Query options.
   * @returns Resolves when the database is reachable.
   * @throws ConnectionError subclasses.
   */
  async authenticate(options: QueryOptionsBase = {}): Promise<void> {
    await this.internals.execute({ text: 'SELECT 1+1 AS result', values: [] }, options);
  }

  /**
   * Server version, e.g. `'16.4'`.
   *
   * @param options - Query options.
   * @returns Version string.
   */
  async databaseVersion(options: QueryOptionsBase = {}): Promise<string> {
    const query = { text: 'SHOW server_version', values: [] };
    const result = await this.internals.execute(query, options);
    return String(result.rows[0]?.['server_version'] ?? '').split(' ')[0] ?? '';
  }

  /**
   * Closes all pooled connections.
   *
   * @returns Resolves when closed.
   */
  async close(): Promise<void> {
    await this.internals.close();
  }
}
