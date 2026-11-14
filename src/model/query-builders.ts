import { directionOf } from '../sql/order.ts';
import { isDefaultValueGenerator } from '../data-types/data-types.ts';
import { isExpression } from '../expressions/methods.ts';
import {
  binary,
  ident,
  param,
  raw,
  type DeleteNode,
  type ExprNode,
  type InsertNode,
  type LockNode,
  type FromItem,
  type WithClause,
  type OnConflictNode,
  type OrderNode,
  type SelectNode,
  type SetItem,
  type TableRef,
  type UpdateNode,
} from '../sql/ast.ts';
import {
  isEmptyWhere,
  toExpr,
  whereToAst,
  type AttributeRef,
  type WhereContext,
} from '../where/where.ts';
import type { AttributeDefinition, ModelDefinition } from './definition.ts';

/** `attributes` option of finders. */
export type FindAttributeOptions = readonly (string | readonly [unknown, string])[] | AttributeSpec;

/** `attributes: { include, exclude }` form. */
export type AttributeSpec = Readonly<{
  /** Extra columns added to all attributes. */
  include?: readonly (string | readonly [unknown, string])[];
  /** Attributes left out. */
  exclude?: readonly string[];
}>;

/** One `order` item: attribute name, `[attribute, direction]`, `[expression, direction]` or an expression. */
export type OrderItem = string | unknown | readonly [unknown, string?];

/** `order` option of finders. */
export type Order = unknown | readonly OrderItem[];

/** Model whose rows are locked by `lock.of`. */
export type LockTarget = Readonly<{
  /** Model name used as table alias. */
  name: string;
}>;

/** `lock` option of finders. */
export type LockOption =
  | boolean
  | LockNode['strength']
  | Readonly<{
      /** Lock strength. */
      level: LockNode['strength'];
      /** Model whose rows are locked (`FOR UPDATE OF`). */
      of?: LockTarget;
    }>;

/** Options that shape a SELECT statement. */
export type SelectOptions = Readonly<{
  /** Filter. */
  where?: unknown;
  /** Selected attributes. */
  attributes?: FindAttributeOptions;
  /** Sort order. */
  order?: Order;
  /** `GROUP BY` attributes or expressions. */
  group?: unknown;
  /** `HAVING` condition. */
  having?: unknown;
  /** Maximum number of rows. */
  limit?: number | null;
  /** Rows to skip. */
  offset?: number | null;
  /** Row lock (`FOR UPDATE` etc.); requires a transaction. */
  lock?: LockOption;
  /** `SKIP LOCKED`. */
  skipLocked?: boolean;
  /** `NOWAIT`. PostgreSQL extension. */
  noWait?: boolean;
  /** `SELECT DISTINCT ON (...)`: attributes or expressions. PostgreSQL extension. */
  distinctOn?: readonly unknown[];
  /** @internal Resolved `WITH` clause. */
  withClause?: WithClause;
  /** @internal Resolved extra FROM relations. */
  extraFrom?: readonly FromItem[];
}>;

/** Table reference of the model. */
export const tableOf = (definition: ModelDefinition, alias?: string): TableRef => ({
  name: definition.tableName,
  ...(definition.schema === undefined ? {} : { schema: definition.schema }),
  ...(alias === undefined ? {} : { alias }),
});

const attributeRef = (attribute: AttributeDefinition): AttributeRef => ({
  field: attribute.field,
  ...(attribute.type.isJson === true ? { isJson: true } : {}),
  ...(attribute.type.serialize === undefined ? {} : { serialize: attribute.type.serialize }),
});

/** Where-compiler context resolving attribute names of the model. */
export const whereContext = (
  definition: ModelDefinition,
  alias: string | undefined,
  inAsAnyThreshold?: number,
): WhereContext => ({
  ...(alias === undefined ? {} : { tableAlias: alias }),
  ...(inAsAnyThreshold === undefined ? {} : { inAsAnyThreshold }),
  resolve: (name) => {
    const attribute = definition.attributes.get(name);
    return attribute === undefined ? undefined : attributeRef(attribute);
  },
});

export const whereClause = (where: unknown, ctx: WhereContext): ExprNode | undefined =>
  isEmptyWhere(where) ? undefined : whereToAst(where, ctx);

export const storedAttributes = (definition: ModelDefinition): readonly AttributeDefinition[] =>
  [...definition.attributes.values()].filter((attribute) => attribute.type.isVirtual !== true);

const columnFor = (definition: ModelDefinition, alias: string, name: string): ExprNode => {
  const attribute = definition.attributes.get(name);
  const column = ident(alias, attribute?.field ?? name);
  return attribute === undefined || attribute.field === name
    ? column
    : { kind: 'alias', expr: column, alias: name };
};

const attributeItem = (
  definition: ModelDefinition,
  alias: string,
  ctx: WhereContext,
  item: string | readonly [unknown, string],
): ExprNode => {
  if (typeof item === 'string') {
    return columnFor(definition, alias, item);
  }
  const [source, name] = item;
  const expr =
    typeof source === 'string'
      ? ident(alias, definition.attributes.get(source)?.field ?? source)
      : toExpr(source, ctx);
  return { kind: 'alias', expr, alias: name };
};

export const selectColumns = (
  definition: ModelDefinition,
  alias: string,
  ctx: WhereContext,
  attributes: FindAttributeOptions | undefined,
): readonly ExprNode[] => {
  const all = storedAttributes(definition).map((attribute) => attribute.fieldName);
  if (attributes === undefined || !Array.isArray(attributes)) {
    const spec = (attributes ?? {}) as AttributeSpec;
    const excluded = new Set(spec.exclude ?? []);
    return [
      ...all
        .filter((name) => !excluded.has(name))
        .map((name) => columnFor(definition, alias, name)),
      ...(spec.include ?? []).map((item) => attributeItem(definition, alias, ctx, item)),
    ];
  }
  return (attributes as readonly (string | readonly [unknown, string])[]).map((item) =>
    attributeItem(definition, alias, ctx, item),
  );
};

const orderTarget = (
  definition: ModelDefinition,
  alias: string,
  ctx: WhereContext,
  target: unknown,
): ExprNode =>
  typeof target === 'string'
    ? definition.attributes.has(target)
      ? ident(alias, definition.attributes.get(target)?.field ?? target)
      : ident(...target.split('.'))
    : toExpr(target, ctx);

export const orderItem = (
  definition: ModelDefinition,
  alias: string,
  ctx: WhereContext,
  item: unknown,
): OrderNode => {
  if (Array.isArray(item)) {
    const [target, direction]: readonly unknown[] = item;
    return {
      expr: orderTarget(definition, alias, ctx, target),
      ...(direction === undefined ? {} : directionOf(direction)),
    };
  }
  return { expr: orderTarget(definition, alias, ctx, item) };
};

const invalidOrder = (): never => {
  throw new Error('Order must be type of array or instance of a valid sequelize method.');
};

const orderBy = (
  definition: ModelDefinition,
  alias: string,
  ctx: WhereContext,
  order: Order,
): readonly OrderNode[] =>
  order === undefined || order === null
    ? []
    : Array.isArray(order)
      ? order.map((item: unknown) => orderItem(definition, alias, ctx, item))
      : isExpression(order)
        ? [{ expr: toExpr(order, ctx) }]
        : invalidOrder();

const groupBy = (
  definition: ModelDefinition,
  alias: string,
  ctx: WhereContext,
  group: unknown,
): readonly ExprNode[] =>
  group === undefined
    ? []
    : (Array.isArray(group) ? group : [group]).map((item: unknown) =>
        orderTarget(definition, alias, ctx, item),
      );

const lockOf = (options: SelectOptions): LockNode | undefined => {
  if (options.lock === undefined || options.lock === false) {
    return undefined;
  }
  if (options.skipLocked === true && options.noWait === true) {
    throw new Error('skipLocked and noWait cannot be used together');
  }
  const wait =
    options.skipLocked === true ? 'SKIP LOCKED' : options.noWait === true ? 'NOWAIT' : undefined;
  const base: LockNode =
    options.lock === true
      ? { strength: 'UPDATE' }
      : typeof options.lock === 'string'
        ? { strength: options.lock }
        : {
            strength: options.lock.level,
            ...(options.lock.of === undefined ? {} : { of: [options.lock.of.name] }),
          };
  return wait === undefined ? base : { ...base, wait };
};

const definedNumber = (value: number | null | undefined): number | undefined =>
  value === null || value === undefined ? undefined : value;

/** Builds a SELECT for `findAll`-style options. */
export const buildSelect = (
  definition: ModelDefinition,
  options: SelectOptions,
  inAsAnyThreshold?: number,
  columnsOverride?: readonly ExprNode[],
  aliasOverride?: string,
): SelectNode => {
  const alias = aliasOverride ?? definition.name;
  const ctx = whereContext(definition, alias, inAsAnyThreshold);
  const where = whereClause(options.where, ctx);
  const having = whereClause(options.having, ctx);
  const limit = definedNumber(options.limit);
  const offset = definedNumber(options.offset);
  const lock = lockOf(options);
  const group = groupBy(definition, alias, ctx, options.group);
  const distinctOn = (options.distinctOn ?? []).map((item) =>
    orderTarget(definition, alias, ctx, item),
  );
  return {
    kind: 'select',
    ...(options.withClause === undefined ? {} : { with: options.withClause }),
    ...(options.extraFrom === undefined || options.extraFrom.length === 0
      ? {}
      : { extraFrom: options.extraFrom }),
    ...(distinctOn.length === 0 ? {} : { distinctOn }),
    columns: columnsOverride ?? selectColumns(definition, alias, ctx, options.attributes),
    from: tableOf(definition, alias),
    ...(where === undefined ? {} : { where }),
    ...(group.length === 0 ? {} : { groupBy: group }),
    ...(having === undefined ? {} : { having }),
    orderBy: orderBy(definition, alias, ctx, options.order),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
    ...(lock === undefined ? {} : { lock }),
  };
};

/** Builds `SELECT count(...) AS "count"` for `count()`. */
export const buildCount = (
  definition: ModelDefinition,
  options: SelectOptions & Readonly<{ col?: string; distinct?: boolean }>,
  inAsAnyThreshold?: number,
): SelectNode => {
  const alias = definition.name;
  const target: ExprNode =
    options.col === undefined
      ? options.distinct === true
        ? ident(alias, definition.attributes.get(definition.primaryKeys[0] ?? 'id')?.field ?? 'id')
        : { kind: 'star' }
      : orderTarget(definition, alias, whereContext(definition, alias), options.col);
  const count: ExprNode = {
    kind: 'alias',
    expr: {
      kind: 'fn',
      name: 'count',
      args: [target],
      ...(options.distinct === true ? { distinct: true } : {}),
    },
    alias: 'count',
  };
  const ctx = whereContext(definition, alias);
  const groupColumns = groupBy(definition, alias, ctx, options.group);
  const { order: _order, limit: _limit, offset: _offset, lock: _lock, ...rest } = options;
  return buildSelect(definition, rest, inAsAnyThreshold, [...groupColumns, count]);
};

/** Builds `SELECT fn(field) AS "fn"` for `aggregate()`. */
export const buildAggregate = (
  definition: ModelDefinition,
  field: string,
  aggregateFunction: string,
  options: SelectOptions & Readonly<{ distinct?: boolean }>,
  inAsAnyThreshold?: number,
): SelectNode => {
  const alias = definition.name;
  const ctx = whereContext(definition, alias);
  const target =
    field === '*' ? ({ kind: 'star' } as const) : orderTarget(definition, alias, ctx, field);
  const column: ExprNode = {
    kind: 'alias',
    expr: {
      kind: 'fn',
      name: aggregateFunction,
      args: [target],
      ...(options.distinct === true ? { distinct: true } : {}),
    },
    alias: aggregateFunction,
  };
  const { order: _order, limit: _limit, offset: _offset, ...rest } = options;
  return buildSelect(definition, rest, inAsAnyThreshold, [
    ...groupBy(definition, alias, ctx, options.group),
    column,
  ]);
};

/** Column value for INSERT/UPDATE: bound parameter, expression, or `DEFAULT`. */
export const valueExpr = (
  attribute: AttributeDefinition | undefined,
  value: unknown,
  ctx: WhereContext,
): ExprNode =>
  isDefaultValueGenerator(value)
    ? param(value.generate())
    : toExpr(value, ctx, attribute === undefined ? undefined : attributeRef(attribute));

const insertableAttributes = (
  definition: ModelDefinition,
  rows: readonly Readonly<Record<string, unknown>>[],
): readonly string[] =>
  storedAttributes(definition)
    .filter((attribute) => attribute.generated === undefined)
    .map((attribute) => attribute.fieldName)
    .filter((name) => rows.some((row) => row[name] !== undefined));

const isAutoIncrementEmpty = (
  attribute: AttributeDefinition | undefined,
  value: unknown,
): boolean => attribute?.autoIncrement === true && (value === null || value === undefined);

/** Returning list: all stored columns aliased to attribute names. */
export const returningAll = (definition: ModelDefinition, alias?: string): readonly ExprNode[] =>
  storedAttributes(definition).map((attribute) => {
    const column = alias === undefined ? ident(attribute.field) : ident(alias, attribute.field);
    return attribute.field === attribute.fieldName && alias === undefined
      ? column
      : { kind: 'alias', expr: column, alias: attribute.fieldName };
  });

/** Builds a multi-row INSERT from attribute-keyed rows. */
export const buildInsert = (
  definition: ModelDefinition,
  rows: readonly Readonly<Record<string, unknown>>[],
  options: Readonly<{
    returning?: boolean | readonly ExprNode[];
    onConflict?: OnConflictNode;
    overriding?: 'system' | 'user';
  }> = {},
): InsertNode => {
  const ctx = whereContext(definition, undefined);
  const attributes = insertableAttributes(definition, rows).filter(
    (name) =>
      !rows.every((row) => isAutoIncrementEmpty(definition.attributes.get(name), row[name])),
  );
  const returning =
    options.returning === true
      ? returningAll(definition)
      : options.returning === false
        ? undefined
        : options.returning;
  return {
    kind: 'insert',
    table: tableOf(definition, options.onConflict === undefined ? undefined : definition.name),
    columns: attributes.map((name) => definition.attributes.get(name)?.field ?? name),
    rows: rows.map((row) =>
      attributes.map((name) => {
        const attribute = definition.attributes.get(name);
        const value = row[name];
        return value === undefined || isAutoIncrementEmpty(attribute, value)
          ? raw('DEFAULT')
          : valueExpr(attribute, value, ctx);
      }),
    ),
    ...(options.onConflict === undefined ? {} : { onConflict: options.onConflict }),
    ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
    ...(returning === undefined ? {} : { returning }),
  };
};

/** SET items from attribute-keyed values. */
export const setItems = (
  definition: ModelDefinition,
  values: Readonly<Record<string, unknown>>,
  ctx: WhereContext = whereContext(definition, undefined),
): readonly SetItem[] => {
  return Object.entries(values)
    .filter(
      ([name, value]) =>
        value !== undefined && definition.attributes.get(name)?.generated === undefined,
    )
    .map(([name, value]) => {
      const attribute = definition.attributes.get(name);
      return { column: attribute?.field ?? name, value: valueExpr(attribute, value, ctx) };
    });
};

/** Builds an UPDATE. */
export const buildUpdate = (
  definition: ModelDefinition,
  set: readonly SetItem[],
  where: unknown,
  options: Readonly<{
    returning?: boolean;
    inAsAnyThreshold?: number;
    from?: readonly FromItem[];
  }> = {},
): UpdateNode => {
  const alias =
    options.from === undefined || options.from.length === 0 ? undefined : definition.name;
  const condition = whereClause(where, whereContext(definition, alias, options.inAsAnyThreshold));
  return {
    kind: 'update',
    table: tableOf(definition, alias),
    set,
    ...(alias === undefined ? {} : { from: options.from }),
    ...(condition === undefined ? {} : { where: condition }),
    ...(options.returning === true ? { returning: returningAll(definition, alias) } : {}),
  };
};

/** Builds a DELETE. */
export const buildDelete = (
  definition: ModelDefinition,
  where: unknown,
  options: Readonly<{
    returning?: boolean;
    inAsAnyThreshold?: number;
    limit?: number;
    using?: readonly FromItem[];
  }> = {},
): DeleteNode => {
  const alias =
    options.using === undefined || options.using.length === 0 ? undefined : definition.name;
  const ctx = whereContext(definition, alias, options.inAsAnyThreshold);
  const condition = whereClause(where, ctx);
  const limited: ExprNode | undefined =
    options.limit === undefined
      ? condition
      : binary('IN', raw('ctid'), {
          kind: 'subquery',
          query: {
            kind: 'select',
            columns: [raw('ctid')],
            from: tableOf(definition),
            ...(condition === undefined ? {} : { where: condition }),
            limit: options.limit,
          },
        });
  return {
    kind: 'delete',
    table: tableOf(definition, alias),
    ...(alias === undefined ? {} : { using: options.using }),
    ...(limited === undefined ? {} : { where: limited }),
    ...(options.returning === true ? { returning: returningAll(definition, alias) } : {}),
  };
};

/** SET item `field = field + by` for increment/decrement. */
export const incrementItems = (
  definition: ModelDefinition,
  by: Readonly<Record<string, number>>,
  sign: 1 | -1,
): readonly SetItem[] =>
  Object.entries(by).map(([name, amount]) => {
    const field = definition.attributes.get(name)?.field ?? name;
    return { column: field, value: binary(sign === 1 ? '+' : '-', ident(field), param(amount)) };
  });

/** Primary-key where object for an instance. */
export const primaryKeyWhere = (
  definition: ModelDefinition,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(definition.primaryKeys.map((name) => [name, values[name]]));

export { directionOf };
