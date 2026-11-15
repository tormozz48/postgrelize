import type { QueryResultRow } from 'pg';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { AnyModel, ModelStatic, Values } from './options.ts';

const toNumber = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
    ? Number(value)
    : value;

const NUMERIC_KEYS: ReadonlySet<string | undefined> = new Set([
  'INTEGER',
  'SMALLINT',
  'FLOAT',
  'DOUBLE',
  'REAL',
  'DECIMAL',
  'BIGINT',
]);

/**
 * Converts driver rows into attribute values and model instances: column names to attribute
 * names, data type parsers, nested `raw` rows and aggregate results.
 */
export class RowMapper {
  readonly #registry: ModelRegistry;

  /**
   * @param registry - Model definitions.
   */
  constructor(registry: ModelRegistry) {
    this.#registry = registry;
  }

  /**
   * Converts a driver row into attribute values: maps column names to attribute names (when the
   * query did not alias them) and applies data type parsers. Unknown columns are kept as is.
   *
   * @param definition - Model definition.
   * @param row - Driver row.
   * @returns Attribute values.
   */
  parse(definition: ModelDefinition, row: QueryResultRow): Readonly<Record<string, unknown>> {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const name = definition.attributes.has(key)
          ? key
          : (definition.fieldToAttribute.get(key) ?? key);
        const parse = definition.attributes.get(name)?.type.parse;
        return [name, parse === undefined || value === null ? value : parse(value)];
      }),
    );
  }

  /**
   * Parses a driver row into attribute values of `model`.
   *
   * @param model - Model class.
   * @param row - Driver row.
   * @returns Attribute values.
   */
  parseModel(
    model: object,
    row: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    return this.parse(this.#registry.definition(model), row);
  }

  /**
   * Builds a persisted instance from a driver row.
   *
   * @param model - Model class.
   * @param row - Driver row.
   * @returns Instance with `isNewRecord: false`.
   */
  instance<M extends AnyModel>(model: ModelStatic<M>, row: Readonly<Record<string, unknown>>): M {
    return new model(this.parseModel(model, row), { isNewRecord: false, raw: true });
  }

  /**
   * Nests `a.b` keys of a raw row into objects (`nest: true`).
   *
   * @param row - Raw row.
   * @returns Nested values.
   */
  nest(row: Values): Values {
    return Object.entries(row).reduce<Values>((result, [key, value]) => {
      const path = key.split('.');
      const leaf = path.pop() ?? key;
      const parent = path.reduce<Values>((node, part) => {
        const child = node[part];
        return (typeof child === 'object' && child !== null ? child : (node[part] = {})) as Values;
      }, result);
      parent[leaf] = value;
      return result;
    }, {});
  }

  /**
   * Parses an aggregate result: numbers for counts and numeric attributes, the attribute parser
   * otherwise.
   *
   * @param attribute - Aggregated attribute.
   * @param aggregateFunction - Aggregate function name.
   * @param value - Returned value.
   * @returns Parsed value.
   */
  aggregate(
    attribute: Pick<AttributeDefinition, 'type'> | undefined,
    aggregateFunction: string,
    value: unknown,
  ): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (aggregateFunction === 'count' || NUMERIC_KEYS.has(attribute?.type.key ?? 'FLOAT')) {
      return toNumber(value);
    }
    return attribute?.type.parse === undefined ? value : attribute.type.parse(value);
  }
}
