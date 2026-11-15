import { DefaultValueGenerator } from '../data-types/default-value-generator.ts';
import { SqlExpression } from '../expressions/methods.ts';
import type { AttributeDefinition, ModelDefinition } from './definition.ts';
import type { AttributeAmounts, Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';

export const isEqualValue = (left: unknown, right: unknown): boolean =>
  left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : typeof left === 'object' && left !== null && typeof right === 'object' && right !== null
      ? JSON.stringify(left) === JSON.stringify(right)
      : left === right;

export const clone = <T>(value: T): T =>
  value instanceof SqlExpression ? value : structuredClone(value);

export const defaultValueOf = (attribute: AttributeDefinition): unknown =>
  attribute.defaultValue instanceof DefaultValueGenerator
    ? attribute.defaultValue.generate()
    : clone(attribute.defaultValue);

export const initialValues = (definition: ModelDefinition): Values =>
  Object.fromEntries([
    ...[...definition.attributes.values()]
      .filter((attribute) => attribute.defaultValue !== undefined)
      .map((attribute) => [attribute.fieldName, defaultValueOf(attribute)] as const),
    ...definition.primaryKeys
      .filter((name) => definition.attributes.get(name)?.defaultValue === undefined)
      .map((name) => [name, null] as const),
  ]);

export const nestRow = (row: Values): Values =>
  Object.entries(row).reduce<Values>((result, [key, value]) => {
    const path = key.split('.');
    const leaf = path.pop() ?? key;
    const parent = path.reduce<Values>((node, part) => {
      const child = node[part];
      return (typeof child === 'object' && child !== null ? child : (node[part] = {})) as Values;
    }, result);
    parent[leaf] = value;
    return result;
  }, {});

export const toNumber = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
    ? Number(value)
    : value;

export const parseAggregate = (
  attribute: AttributeDefinition | undefined,
  aggregateFunction: string,
  value: unknown,
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  const key = attribute?.type.key;
  if (
    aggregateFunction === 'count' ||
    key === 'INTEGER' ||
    key === 'SMALLINT' ||
    key === 'FLOAT' ||
    key === 'DOUBLE' ||
    key === 'REAL' ||
    key === 'DECIMAL' ||
    key === 'BIGINT'
  ) {
    return toNumber(value);
  }
  return attribute?.type.parse === undefined ? value : attribute.type.parse(value);
};

export const toAmounts = (
  fields: AttributeAmounts<Values>,
  by: number,
): Readonly<Record<string, number>> =>
  typeof fields === 'string'
    ? { [fields]: by }
    : Array.isArray(fields)
      ? Object.fromEntries(fields.map((name: string) => [name, by]))
      : (fields as Readonly<Record<string, number>>);

export const pickFields = (values: Values, fields: readonly string[] | undefined): Values =>
  fields === undefined
    ? values
    : Object.fromEntries(Object.entries(values).filter(([key]) => fields.includes(key)));

export const pickQueryOptions = (options: QueryOptionsBase): QueryOptionsBase => ({
  ...(options.transaction === undefined ? {} : { transaction: options.transaction }),
  ...(options.logging === undefined ? {} : { logging: options.logging }),
  ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
});

export const withTimestamps = (
  definition: ModelDefinition,
  values: Values,
  now: Date,
  creating: boolean,
  silent: boolean,
): Values => ({
  ...values,
  ...(creating &&
  definition.createdAt !== undefined &&
  (values[definition.createdAt] === undefined || values[definition.createdAt] === null)
    ? { [definition.createdAt]: now }
    : {}),
  ...(definition.updatedAt !== undefined && (!silent || creating)
    ? {
        [definition.updatedAt]:
          creating && values[definition.updatedAt] instanceof Date && silent
            ? values[definition.updatedAt]
            : now,
      }
    : {}),
});

export const plainWhereValues = (where: unknown): Values =>
  typeof where === 'object' &&
  where !== null &&
  !Array.isArray(where) &&
  !(where instanceof SqlExpression)
    ? Object.fromEntries(
        Object.entries(where).filter(
          ([, value]) => typeof value !== 'object' || value === null || value instanceof Date,
        ),
      )
    : {};
