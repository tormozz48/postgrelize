import type { QueryResultRow } from 'pg';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';
import type { ModelRegistry } from './model-registry.ts';
import { RowPlans } from './row-plan.ts';
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
  readonly #plans = new RowPlans();

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
    const columns = this.#plans.columns(definition);
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const { name, parse } = columns.get(key) ?? this.#plans.plan(definition, columns, key);
      const value: unknown = row[key];
      const parsed = parse === undefined || value === null ? value : parse(value);
      RowMapper.#store(values, name, parsed);
    }
    return values;
  }

  /**
   * Like {@link RowMapper.parse}, for a row nobody else reads afterwards (raw results): parsers
   * are applied in place and the row itself is returned, which saves one object per row. A column
   * that maps to another attribute name switches to {@link RowMapper.parse} for the remaining
   * columns, so the key order matches `parse`.
   *
   * @param definition - Model definition.
   * @param row - Driver row; modified.
   * @returns Attribute values.
   */
  parseOwned(definition: ModelDefinition, row: QueryResultRow): Readonly<Record<string, unknown>> {
    const columns = this.#plans.columns(definition);
    const keys = Object.keys(row);
    for (const [index, key] of keys.entries()) {
      const { name, parse } = columns.get(key) ?? this.#plans.plan(definition, columns, key);
      if (name !== key) {
        return this.#renamed(definition, row, keys, index);
      }
      const value: unknown = row[key];
      if (parse !== undefined && value !== null) {
        row[key] = parse(value);
      }
    }
    return row;
  }

  #renamed(
    definition: ModelDefinition,
    row: QueryResultRow,
    keys: readonly string[],
    from: number,
  ): Readonly<Record<string, unknown>> {
    const done = Object.fromEntries(keys.slice(0, from).map((key) => [key, row[key]]));
    const rest = Object.fromEntries(keys.slice(from).map((key) => [key, row[key]]));
    return Object.assign(done, this.parse(definition, rest));
  }

  static #store(values: Record<string, unknown>, name: string, value: unknown): void {
    if (name === '__proto__') {
      // Keeps a column called `__proto__` an own property, like `Object.fromEntries`.
      Object.defineProperty(values, name, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      values[name] = value;
    }
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
