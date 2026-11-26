import inflection from 'inflection';
import type { ModelDefaults } from '../connection/options.ts';
import { DataTypes } from '../data-types/data-types.ts';
import { AttributeNormalizer } from './attribute-normalizer.ts';
import type { AttributeDefinition, ModelAttributes } from './attribute-options.ts';
import type { DefinitionOptions, ModelDefinitionFields } from './model-definition.ts';

type SpecialAttributes = Readonly<{
  createdAt: string | undefined;
  updatedAt: string | undefined;
  deletedAt: string | undefined;
  version: string | undefined;
}>;

const attributes = new AttributeNormalizer();

/**
 * Normalizes `Model.init` arguments into the fields of a model definition, applying Sequelize v6
 * defaults (table name, automatic primary key, timestamps, paranoid, version, unique keys).
 *
 * @internal
 */
export class DefinitionNormalizer {
  readonly #attributes: ModelAttributes;
  readonly #associationAttributes: ModelAttributes;
  readonly #options: DefinitionOptions;
  readonly #name: string;
  readonly #underscored: boolean;
  readonly #tableName: string;

  /**
   * @param className - Class name (default model name).
   * @param declared - Declared attributes.
   * @param options - Model options.
   * @param defaults - `define` defaults of the Sequelize instance.
   * @param associationAttributes - Attributes added by associations (foreign keys).
   */
  constructor(
    className: string,
    declared: ModelAttributes,
    options: DefinitionOptions,
    defaults: ModelDefaults,
    associationAttributes: ModelAttributes,
  ) {
    this.#attributes = declared;
    this.#associationAttributes = associationAttributes;
    this.#options = { timestamps: true, ...defaults, ...options };
    this.#name = this.#options.modelName ?? className;
    this.#underscored = this.#options.underscored === true;
    this.#tableName =
      this.#options.tableName ??
      (this.#options.freezeTableName === true
        ? this.#name
        : attributes.underscoredIf(inflection.pluralize(this.#name), this.#underscored));
  }

  /**
   * Normalized definition fields.
   *
   * @returns The fields.
   */
  fields(): ModelDefinitionFields {
    const special = this.#specialAttributes();
    const normalized = this.#normalizedAttributes(special);
    const list = [...normalized.values()];
    return {
      name: this.#name,
      tableName: this.#tableName,
      schema: this.#options.schema,
      attributes: normalized,
      fieldToAttribute: new Map(list.map((attribute) => [attribute.field, attribute.fieldName])),
      primaryKeys: list
        .filter((attribute) => attribute.primaryKey === true)
        .map((attribute) => attribute.fieldName),
      ...special,
      uniqueKeys: attributes.uniqueKeys(this.#tableName, list),
      options: this.#options,
    };
  }

  #specialAttributes(): SpecialAttributes {
    const options = this.#options;
    this.#assertTimestampOptions();
    const timestamps = options.timestamps === true;
    return {
      createdAt: timestamps ? this.#timestampName(options.createdAt, 'createdAt') : undefined,
      updatedAt: timestamps ? this.#timestampName(options.updatedAt, 'updatedAt') : undefined,
      deletedAt:
        timestamps && options.paranoid === true
          ? this.#timestampName(options.deletedAt, 'deletedAt')
          : undefined,
      version:
        options.version === undefined || options.version === false
          ? undefined
          : typeof options.version === 'string'
            ? options.version
            : 'version',
    };
  }

  #assertTimestampOptions(): void {
    for (const key of ['createdAt', 'updatedAt', 'deletedAt'] as const) {
      this.#assertTimestampOption(key, this.#options[key]);
    }
  }

  #assertTimestampOption(key: string, value: unknown): void {
    if (value !== undefined && typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error(
        `Value for "${key}" option must be a string or a boolean, got ${typeof value}`,
      );
    }
  }

  #timestampName(option: string | boolean | undefined, fallback: string): string | undefined {
    return option === false ? undefined : typeof option === 'string' ? option : fallback;
  }

  #normalizedAttributes(special: SpecialAttributes): Map<string, AttributeDefinition> {
    const withAssociations: ModelAttributes = {
      ...this.#associationAttributes,
      ...this.#attributes,
    };
    const generated = new Set([
      ...Object.keys(this.#autoPrimaryKey(withAssociations)),
      special.createdAt,
      special.updatedAt,
      special.deletedAt,
      special.version,
    ]);
    const all: ModelAttributes = {
      ...this.#autoPrimaryKey(withAssociations),
      ...this.#attributes,
      ...this.#undeclared(this.#timestampAttributes(special)),
      ...this.#undeclared(this.#associationAttributes),
    };
    return new Map(Object.entries(all).map(([name, input]) => this.#entry(name, input, generated)));
  }

  #entry(
    name: string,
    input: ModelAttributes[string],
    generated: ReadonlySet<string | undefined>,
  ): readonly [string, AttributeDefinition] {
    const normalized = attributes.attribute(name, input, this.#underscored);
    const definition =
      (this.#options as Readonly<{ typeValidation?: boolean }>).typeValidation === true
        ? Object.freeze({ ...normalized, typeChecked: true })
        : normalized;
    return [
      name,
      generated.has(name) && !(name in this.#attributes)
        ? Object.freeze({ ...definition, _autoGenerated: true })
        : definition,
    ];
  }

  #undeclared(added: ModelAttributes): ModelAttributes {
    return Object.fromEntries(Object.entries(added).filter(([key]) => !(key in this.#attributes)));
  }

  #autoPrimaryKey(declared: ModelAttributes): ModelAttributes {
    const entries = Object.values(declared);
    if (entries.some((value) => attributes.isOptions(value) && value.primaryKey === true)) {
      return {};
    }
    if ('id' in declared) {
      throw new Error(
        `A column called 'id' was added to the attributes of '${this.#tableName}' but not marked with 'primaryKey: true'`,
      );
    }
    return {
      id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
    };
  }

  #timestampAttributes({
    createdAt,
    updatedAt,
    deletedAt,
    version,
  }: SpecialAttributes): ModelAttributes {
    return Object.fromEntries([
      ...[createdAt, updatedAt]
        .filter((name): name is string => name !== undefined)
        .map((name) => [name, { type: DataTypes.DATE, allowNull: false }] as const),
      ...(deletedAt === undefined ? [] : [[deletedAt, { type: DataTypes.DATE }] as const]),
      ...(version === undefined
        ? []
        : [[version, { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }] as const]),
    ]);
  }
}
