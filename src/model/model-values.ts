import { DefaultValueGenerator } from '../data-types/default-value-generator.ts';
import { SqlExpression } from '../expressions/methods.ts';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';
import type { AttributeAmounts, Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';

/**
 * Attribute value rules of model operations: change detection, defaults, timestamps, field
 * selection, increment amounts, values taken from `where`, and the query options passed on to
 * nested queries.
 */
export class ModelValues {
  /**
   * Whether two attribute values are equal (dates by time, objects by JSON).
   *
   * @param left - First value.
   * @param right - Second value.
   * @returns True when equal.
   */
  isEqual(left: unknown, right: unknown): boolean {
    return left instanceof Date && right instanceof Date
      ? left.getTime() === right.getTime()
      : typeof left === 'object' && left !== null && typeof right === 'object' && right !== null
        ? JSON.stringify(left) === JSON.stringify(right)
        : left === right;
  }

  /**
   * Values of a new instance: attribute defaults and `null` primary keys.
   *
   * @param definition - Model definition.
   * @returns Initial values.
   */
  initial(definition: ModelDefinition): Values {
    return Object.fromEntries([
      ...[...definition.attributes.values()]
        .filter((attribute) => attribute.defaultValue !== undefined)
        .map((attribute) => [attribute.fieldName, this.#defaultValueOf(attribute)] as const),
      ...definition.primaryKeys
        .filter((name) => definition.attributes.get(name)?.defaultValue === undefined)
        .map((name) => [name, null] as const),
    ]);
  }

  /**
   * Amount per attribute of `increment` / `decrement`.
   *
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param by - Amount for names.
   * @returns Amount per attribute.
   */
  amounts(fields: AttributeAmounts<Values>, by: number): Readonly<Record<string, number>> {
    return typeof fields === 'string'
      ? { [fields]: by }
      : Array.isArray(fields)
        ? Object.fromEntries(fields.map((name: string) => [name, by]))
        : (fields as Readonly<Record<string, number>>);
  }

  /**
   * Values restricted to `fields` (all values when `fields` is not given).
   *
   * @param values - Values.
   * @param fields - Attribute names.
   * @returns Picked values.
   */
  pick(values: Values, fields: readonly string[] | undefined): Values {
    return fields === undefined
      ? values
      : Object.fromEntries(Object.entries(values).filter(([key]) => fields.includes(key)));
  }

  /**
   * Explicit `fields` of `save` / `create` extended like v6: `updatedAt` and the version
   * attribute (when anything is written), and for an INSERT `createdAt` and primary keys that
   * have a default.
   *
   * @param definition - Model definition.
   * @param fields - Fields as given, or `undefined`.
   * @param creating - Whether the row is inserted.
   * @returns Fields to write (`undefined` when none were given).
   */
  saveFields(
    definition: ModelDefinition,
    fields: readonly string[] | undefined,
    creating: boolean,
  ): readonly string[] | undefined {
    if (fields === undefined) {
      return undefined;
    }
    const keys = definition.primaryKeys.filter(
      (name) => definition.attributes.get(name)?.defaultValue !== undefined,
    );
    const extra = [
      ...(fields.length > 0 ? [definition.updatedAt, definition.version] : []),
      ...(creating ? [definition.createdAt] : []),
    ].filter((name): name is string => name !== undefined);
    return [...new Set([...(creating ? keys : []), ...fields, ...extra])];
  }

  /**
   * Explicit `fields` of `bulkCreate` extended with the timestamp attributes, like v6.
   *
   * @param definition - Model definition.
   * @param fields - Fields as given, or `undefined`.
   * @returns Fields to write (`undefined` when none were given).
   */
  bulkFields(
    definition: ModelDefinition,
    fields: readonly string[] | undefined,
  ): readonly string[] | undefined {
    return fields === undefined
      ? undefined
      : [
          ...new Set([
            ...fields,
            ...[definition.createdAt, definition.updatedAt].filter(
              (name): name is string => name !== undefined,
            ),
          ]),
        ];
  }

  /**
   * Query options passed on to nested queries: `transaction`, `logging`, `benchmark`, `retry`,
   * `searchPath`.
   *
   * @param options - Options of the outer call.
   * @returns Query options.
   */
  queryOptions(options: QueryOptionsBase): QueryOptionsBase {
    return {
      ...(options.transaction === undefined ? {} : { transaction: options.transaction }),
      ...(options.logging === undefined ? {} : { logging: options.logging }),
      ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
      ...(options.logQueryParameters === undefined
        ? {}
        : { logQueryParameters: options.logQueryParameters }),
      ...(options.retry === undefined ? {} : { retry: options.retry }),
      ...(options.searchPath === undefined ? {} : { searchPath: options.searchPath }),
      ...(options.replacements === undefined ? {} : { replacements: options.replacements }),
    };
  }

  /**
   * Sets `createdAt` (on creation, when empty) and `updatedAt` (unless `silent`).
   *
   * @param definition - Model definition.
   * @param values - Values.
   * @param now - Timestamp.
   * @param creating - Whether the row is inserted.
   * @param silent - `silent` option.
   * @returns Values with timestamps.
   */
  withTimestamps(
    definition: ModelDefinition,
    values: Values,
    now: Date,
    creating: boolean,
    silent: boolean,
  ): Values {
    const { createdAt, updatedAt } = definition;
    const setCreatedAt =
      creating &&
      createdAt !== undefined &&
      (values[createdAt] === undefined || values[createdAt] === null);
    return {
      ...values,
      ...(setCreatedAt ? { [createdAt]: this.#stamp(definition, createdAt, now) } : {}),
      ...(updatedAt !== undefined && (!silent || creating)
        ? { [updatedAt]: this.#updatedAt(definition, values, now, creating && silent) }
        : {}),
    };
  }

  // a silent insert keeps the date the instance already has
  #updatedAt(definition: ModelDefinition, values: Values, now: Date, keep: boolean): unknown {
    const name = definition.updatedAt as string;
    return keep && values[name] instanceof Date ? values[name] : this.#stamp(definition, name, now);
  }

  // like v6, a timestamp attribute with its own (truthy) `defaultValue` takes it instead of now
  #stamp(definition: ModelDefinition, name: string, now: Date): unknown {
    const attribute = definition.attributes.get(name);
    return attribute?.defaultValue ? this.#defaultValueOf(attribute) : now;
  }

  /**
   * Plain values of a `where` object (used as defaults by `findOrCreate` / `findOrBuild`).
   *
   * @param where - Condition.
   * @returns Attribute values compared with `=`.
   */
  fromWhere(where: unknown): Values {
    return typeof where === 'object' &&
      where !== null &&
      !Array.isArray(where) &&
      !(where instanceof SqlExpression)
      ? Object.fromEntries(
          Object.entries(where).filter(
            ([, value]) => typeof value !== 'object' || value === null || value instanceof Date,
          ),
        )
      : {};
  }

  #defaultValueOf(attribute: AttributeDefinition): unknown {
    const value = attribute.defaultValue;
    return value instanceof DefaultValueGenerator
      ? value.generate()
      : typeof value === 'function'
        ? (value as () => unknown)()
        : value instanceof SqlExpression
          ? value
          : structuredClone(value);
  }
}
