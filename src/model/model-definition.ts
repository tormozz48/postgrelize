import type { ModelDefaults } from '../connection/options.ts';
import type { DataTypeInput } from '../data-types/data-types.ts';
import type { IndexOptions } from '../ddl/ddl-generator.ts';
import { AttributeNormalizer } from './attribute-normalizer.ts';
import type {
  AttributeDefinition,
  AttributeOptions,
  ModelAttributes,
} from './attribute-options.ts';
import { DefinitionNormalizer } from './definition-normalizer.ts';

export type {
  AttributeDefinition,
  AttributeOptions,
  GeneratedColumn,
  ModelAttributes,
  ReferencedTable,
  ReferenceOptions,
  UniqueOptions,
} from './attribute-options.ts';

const attributeNormalizer = new AttributeNormalizer();

/**
 * Table-level model options shared by `Model.init` and `sequelize.define`.
 *
 * Extends the model defaults (`paranoid`, `timestamps`, `schema`, ...).
 *
 * @example
 * ```ts
 * const opts: DefinitionOptions = {
 *   modelName: 'Invoice',
 *   tableName: 'invoices',
 *   timestamps: true,
 *   paranoid: true,
 *   version: true,
 *   indexes: [{ fields: ['number'], unique: true }],
 * };
 * ```
 */
export type DefinitionOptions = ModelDefaults &
  Readonly<{
    /** Model name. Defaults to the class name. */
    modelName?: string;
    /** Table name. Defaults to the pluralized model name. */
    tableName?: string;
    /** Separator between schema and table that `getTableName` reports (PostgreSQL always uses `.` in SQL). */
    schemaDelimiter?: string;
    /** Name of the created-at attribute, or `false` to disable it.
     * @defaultValue 'createdAt' */
    createdAt?: string | boolean;
    /** Name of the updated-at attribute, or `false` to disable it.
     * @defaultValue 'updatedAt' */
    updatedAt?: string | boolean;
    /** Name of the deleted-at attribute of paranoid models.
     * @defaultValue 'deletedAt' */
    deletedAt?: string | boolean;
    /** Optimistic locking: `true` adds a `version` attribute, a string names it. */
    version?: boolean | string;
    /** Indexes created by `sync()`. */
    indexes?: readonly IndexOptions[];
    /** Table comment. */
    comment?: string;
    /** `CREATE UNLOGGED TABLE` on `sync`: faster writes, no WAL, emptied after a crash, not replicated. */
    unlogged?: boolean;
    /** `CREATE TEMPORARY TABLE` on `sync`: lives as long as the database session; cannot have a `schema`. See {@link QueryInterface.createTable}. */
    temporary?: boolean;
  }>;

/** Normalized fields of a {@link ModelDefinition}. */
export type ModelDefinitionFields = Readonly<{
  /** Model name. */
  name: string;
  /** Table name. */
  tableName: string;
  /** Table schema. */
  schema: string | undefined;
  /** Normalized attributes by attribute name. */
  attributes: ReadonlyMap<string, AttributeDefinition>;
  /** Attribute name by column name. */
  fieldToAttribute: ReadonlyMap<string, string>;
  /** Primary key attribute names. */
  primaryKeys: readonly string[];
  /** Created-at attribute. */
  createdAt: string | undefined;
  /** Updated-at attribute. */
  updatedAt: string | undefined;
  /** Deleted-at attribute when the model is paranoid. */
  deletedAt: string | undefined;
  /** Version attribute when optimistic locking is enabled. */
  version: string | undefined;
  /** Unique keys from attribute `unique` options: key name → attribute names (in definition order). */
  uniqueKeys: ReadonlyMap<string, readonly string[]>;
  /** Model options after defaults were applied. */
  options: DefinitionOptions;
}>;

/**
 * Immutable normalized model definition: table, attributes, keys, timestamps and options of a
 * model, built from `Model.init` arguments with Sequelize v6 defaults by {@link ModelDefinition.normalize}.
 */
export class ModelDefinition {
  /** Model name. */
  readonly name: string;
  /** Table name. */
  readonly tableName: string;
  /** Table schema. */
  readonly schema: string | undefined;
  /** Normalized attributes by attribute name. */
  readonly attributes: ReadonlyMap<string, AttributeDefinition>;
  /** Attribute name by column name. */
  readonly fieldToAttribute: ReadonlyMap<string, string>;
  /** Primary key attribute names. */
  readonly primaryKeys: readonly string[];
  /** Created-at attribute. */
  readonly createdAt: string | undefined;
  /** Updated-at attribute. */
  readonly updatedAt: string | undefined;
  /** Deleted-at attribute when the model is paranoid. */
  readonly deletedAt: string | undefined;
  /** Version attribute when optimistic locking is enabled. */
  readonly version: string | undefined;
  /** Unique keys from attribute `unique` options: key name → attribute names (in definition order). */
  readonly uniqueKeys: ReadonlyMap<string, readonly string[]>;
  /** Model options after defaults were applied. */
  readonly options: DefinitionOptions;

  /**
   * @param fields - Normalized fields; the instance is frozen.
   */
  constructor(fields: ModelDefinitionFields) {
    this.name = fields.name;
    this.tableName = fields.tableName;
    this.schema = fields.schema;
    this.attributes = fields.attributes;
    this.fieldToAttribute = fields.fieldToAttribute;
    this.primaryKeys = fields.primaryKeys;
    this.createdAt = fields.createdAt;
    this.updatedAt = fields.updatedAt;
    this.deletedAt = fields.deletedAt;
    this.version = fields.version;
    this.uniqueKeys = fields.uniqueKeys;
    this.options = fields.options;
    Object.freeze(this);
  }

  /**
   * Normalizes one attribute: column name, data type instance, `allowNull` default.
   *
   * @param name - Attribute name.
   * @param input - Data type or column options.
   * @param underscored - Derive the column name in snake case.
   * @returns Frozen attribute definition.
   */
  static attribute(
    name: string,
    input: DataTypeInput | AttributeOptions,
    underscored: boolean,
  ): AttributeDefinition {
    return attributeNormalizer.attribute(name, input, underscored);
  }

  /**
   * Normalizes `Model.init` arguments into an immutable definition, applying Sequelize v6 defaults.
   *
   * @param className - Class name (default model name).
   * @param attributes - Declared attributes.
   * @param options - Model options.
   * @param defaults - `define` defaults of the Sequelize instance.
   * @param associationAttributes - Attributes added by associations (foreign keys).
   * @returns The definition.
   */
  static normalize(
    className: string,
    attributes: ModelAttributes,
    options: DefinitionOptions,
    defaults: ModelDefaults = {},
    associationAttributes: ModelAttributes = {},
  ): ModelDefinition {
    return new ModelDefinition(
      new DefinitionNormalizer(
        className,
        attributes,
        options,
        defaults,
        associationAttributes,
      ).fields(),
    );
  }
}
