import { inflector as inflection } from './inflector.ts';
import { AbstractDataType, type DataType } from '../data-types/abstract-data-type.ts';
import { DataTypes, type DataTypeInput } from '../data-types/data-types.ts';
import { EnumType } from '../data-types/enum-type.ts';
import type { AttributeDefinition, AttributeOptions } from './attribute-options.ts';
import { IntegerOptionWarnings } from './integer-option-warnings.ts';

const integerWarnings = new IntegerOptionWarnings();

/**
 * Normalizes declared attributes (`Model.init` input) into attribute definitions.
 *
 * @internal
 */
export class AttributeNormalizer {
  /**
   * Normalizes one attribute: column name, data type instance, `allowNull` default.
   *
   * @param name - Attribute name.
   * @param input - Data type or column options.
   * @param underscored - Derive the column name in snake case.
   * @returns Frozen attribute definition.
   */
  attribute(
    name: string,
    input: DataTypeInput | AttributeOptions,
    underscored: boolean,
  ): AttributeDefinition {
    const options: AttributeOptions = this.isOptions(input) ? input : { type: input };
    const { type, field, ...rest } = options;
    return Object.freeze({
      ...rest,
      fieldName: name,
      field: field ?? this.underscoredIf(name, underscored),
      type: AttributeNormalizer.#dataType(type, options.values),
      allowNull: options.allowNull ?? options.primaryKey !== true,
      ...(options.identity === undefined ? {} : { autoIncrement: true }),
    });
  }

  // A bare `ENUM` takes its values from the `values` option; an enum without values is an error (v6).
  static #dataType(type: DataTypeInput, values: readonly string[] | undefined): DataType {
    const resolved =
      type === DataTypes.ENUM ? new EnumType(values ?? []) : AbstractDataType.from(type);
    if (resolved instanceof EnumType && resolved.values.length === 0) {
      throw new Error('Values for ENUM have not been defined.');
    }
    integerWarnings.check(resolved);
    return resolved;
  }

  /**
   * Whether a declared attribute is given as column options rather than as a bare type.
   *
   * @param value - Declared attribute.
   * @returns True for column options.
   */
  isOptions(value: DataTypeInput | AttributeOptions): value is AttributeOptions {
    // a data type (GEOMETRY has a string `type`) carries `sqlType`; column options with a raw type name do not
    return typeof value === 'object' && 'type' in value && !('sqlType' in value);
  }

  /**
   * Snake-cases a name when `underscored` is set.
   *
   * @param name - Name.
   * @param underscored - `underscored` option.
   * @returns The name.
   */
  underscoredIf(name: string, underscored: boolean): string {
    return underscored ? inflection.underscore(name) : name;
  }

  /**
   * Unique keys from attribute `unique` options.
   *
   * @param tableName - Table name (prefix of default key names).
   * @param list - Normalized attributes in definition order.
   * @returns Key name → attribute names (in definition order).
   */
  uniqueKeys(
    tableName: string,
    list: readonly AttributeDefinition[],
  ): ReadonlyMap<string, readonly string[]> {
    const named = list.flatMap((attribute) => {
      const name = this.#uniqueKeyName(tableName, attribute);
      return name === undefined ? [] : [[name, attribute.fieldName] as const];
    });
    return new Map(
      [...new Set(named.map(([name]) => name))].map((name) => [
        name,
        named.filter(([key]) => key === name).map(([, attribute]) => attribute),
      ]),
    );
  }

  #uniqueKeyName(tableName: string, attribute: AttributeDefinition): string | undefined {
    const { unique } = attribute;
    // like v6, `null` / `undefined` is no unique key
    return unique === undefined || unique === null || unique === false
      ? undefined
      : typeof unique === 'string'
        ? unique
        : typeof unique === 'object' && unique.name !== undefined
          ? unique.name
          : `${tableName}_${attribute.fieldName}_unique`;
  }
}
