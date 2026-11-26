import type { Sequelize } from '../sequelize.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { InstanceState } from './instance-state.ts';
import type {
  AttributeDefinition,
  DefinitionOptions,
  ModelAttributes,
} from './model-definition.ts';
import { lifecycle, registry } from './model-services.ts';
import type {
  AnyModel,
  BuildOptions,
  InitOptions,
  ModelStatic,
  QualifiedTableName,
  Values,
} from './options.ts';

/**
 * Core of every model: instance state, model metadata and `init`. Capabilities are added by the
 * model mixins; `Model` is the public class.
 *
 * @internal
 */
export class ModelBase {
  /**
   * @param values - Attribute values.
   * @param options - Build options.
   */
  constructor(values: Values = {}, options: BuildOptions = {}) {
    InstanceState.attach(this);
    lifecycle.initialize(this as unknown as AnyModel, values, options);
  }

  /**
   * For instances returned by `insert`, `create` / `bulkCreate` / `upsert` with `onConflict`:
   * true when the row was inserted, false when an existing row was updated (or nothing was
   * written). `undefined` otherwise. PostgreSQL extension.
   * @postgrelize
   */
  get wasInserted(): boolean | undefined {
    return InstanceState.of(this).wasInserted;
  }

  /**
   * For instances returned with `returningOld: true`: attribute values of the row before the
   * statement, or `null` when the row did not exist (inserted). `undefined` otherwise. PostgreSQL 18+.
   * @postgrelize
   */
  get oldValues(): Readonly<Record<string, unknown>> | null | undefined {
    return InstanceState.of(this).oldValues;
  }

  /** `Sequelize` instance the model belongs to. */
  get sequelize(): Sequelize {
    return (this.constructor as typeof ModelBase).sequelize;
  }

  /** Name the model was registered under, as given by `modelName` in the init options (default: the class name). */
  static get modelName(): string {
    return registry.state(this).definition.name;
  }

  /** Name of the database table backing the model (pluralized model name unless `tableName` was set). */
  static get tableName(): string {
    return registry.state(this).definition.tableName;
  }

  /** Normalized attributes keyed by attribute name. */
  static get rawAttributes(): Readonly<Record<string, AttributeDefinition>> {
    return Object.fromEntries(registry.state(this).definition.attributes);
  }

  /** First primary key attribute name. */
  static get primaryKeyAttribute(): string {
    // typed `string` like v6; a model without a primary key yields `undefined` at runtime, as in v6
    return registry.state(this).definition.primaryKeys[0] as string;
  }

  /** All primary key attribute names. */
  static get primaryKeyAttributes(): readonly string[] {
    return registry.state(this).definition.primaryKeys;
  }

  /** Primary key attribute definitions by name (Sequelize v6 `Model.primaryKeys`). */
  static get primaryKeys(): Readonly<Record<string, AttributeDefinition>> {
    const { primaryKeys, attributes } = registry.state(this).definition;
    return Object.fromEntries(
      primaryKeys.map((name) => [name, attributes.get(name) as AttributeDefinition]),
    );
  }

  /** Model options after defaults were applied. */
  static get options(): DefinitionOptions {
    return registry.state(this).definition.options;
  }

  /** `Sequelize` instance the model belongs to. */
  static get sequelize(): Sequelize {
    return (
      (registry.sequelizeOf(this) as unknown as Sequelize | undefined) ??
      (() => {
        throw new Error('Model is not initialized.');
      })()
    );
  }

  /**
   * Defines attributes and options of the model and registers it in `sequelize.models`. Does not
   * touch the database; call {@link Model.sync} or run migrations to create the table.
   *
   * @param this - The model class being initialized.
   * @param attributes - Attribute definitions.
   * @param options - Model options, including the `sequelize` instance.
   * @returns The model class.
   * @example
   * ```ts
   * class Project extends Model {}
   * Project.init(
   *   { id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, name: DataTypes.STRING },
   *   { sequelize, modelName: 'Project', paranoid: true },
   * );
   * ```
   */
  static init<MS extends ModelStatic<AnyModel>, M extends InstanceType<MS> = InstanceType<MS>>(
    this: MS,
    attributes: ModelAttributes<M>,
    options: InitOptions,
  ): MS {
    registry.init(this, attributes, options);
    return this;
  }

  /**
   * Returns the normalized attribute definitions, same as {@link Model.rawAttributes}.
   *
   * @returns Attribute definitions.
   * @example
   * ```ts
   * const attributes = User.getAttributes();
   * Object.keys(attributes);
   * ```
   */
  static getAttributes(): Readonly<Record<string, AttributeDefinition>> {
    return this.rawAttributes;
  }

  /**
   * Table name, or the qualified table (`{ tableName, schema, delimiter, ... }`, like v6) when the
   * model has a schema. `String(qualified)` is the quoted `"schema"."table"` reference.
   *
   * @returns Table name or qualified table.
   * @example
   * ```ts
   * const table = User.getTableName();
   * ```
   */
  static getTableName(): string | QualifiedTableName {
    const { definition } = registry.state(this);
    const { tableName, schema } = definition;
    return schema === undefined
      ? tableName
      : {
          tableName,
          table: tableName,
          name: definition.name,
          schema,
          delimiter: definition.options.schemaDelimiter ?? '.',
          toString: (): string =>
            `${SqlCompiler.quoteIdent(schema)}.${SqlCompiler.quoteIdent(tableName)}`,
        };
  }
}
