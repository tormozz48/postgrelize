import { OrderDirection } from '../sql/order.ts';
import { SqlExpression } from '../expressions/methods.ts';
import {
  SqlAst,
  type ExprNode,
  type LockNode,
  type FromItem,
  type WithClause,
  type OrderNode,
  type SelectNode,
} from '../sql/ast.ts';
import type { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';

const ast = new SqlAst();

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

const invalidOrder = (): never => {
  throw new Error('Order must be type of array or instance of a valid sequelize method.');
};

const definedNumber = (value: number | null | undefined): number | undefined =>
  value === null || value === undefined ? undefined : value;

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

/**
 * Builds SELECT statements of finders: columns from `attributes`, `where` / `having`, `order`,
 * `group`, `distinctOn`, `limit` / `offset`, row locks, and the `count()` / `aggregate()` forms.
 */
export class SelectQueryBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Builds a SELECT for `findAll`-style options.
   *
   * @param definition - Model definition.
   * @param options - Select options.
   * @param inAsAnyThreshold - Lists at least this long compile to `= ANY($n)`.
   * @param columnsOverride - Selected columns instead of `attributes`.
   * @param aliasOverride - Table alias instead of the model name.
   * @returns SELECT node.
   */
  build(
    definition: ModelDefinition,
    options: SelectOptions,
    inAsAnyThreshold?: number,
    columnsOverride?: readonly ExprNode[],
    aliasOverride?: string,
  ): SelectNode {
    const alias = aliasOverride ?? definition.name;
    const ctx = this.#columns.whereCompiler(definition, alias, inAsAnyThreshold);
    const where = this.#columns.where(options.where, ctx);
    const having = this.#columns.where(options.having, ctx);
    const limit = definedNumber(options.limit);
    const offset = definedNumber(options.offset);
    const lock = lockOf(options);
    const group = this.#groupBy(definition, alias, ctx, options.group);
    const distinctOn = (options.distinctOn ?? []).map((item) =>
      this.#orderTarget(definition, alias, ctx, item),
    );
    return {
      kind: 'select',
      ...(options.withClause === undefined ? {} : { with: options.withClause }),
      ...(options.extraFrom === undefined || options.extraFrom.length === 0
        ? {}
        : { extraFrom: options.extraFrom }),
      ...(distinctOn.length === 0 ? {} : { distinctOn }),
      columns: columnsOverride ?? this.columns(definition, alias, ctx, options.attributes),
      from: this.#columns.table(definition, alias),
      ...(where === undefined ? {} : { where }),
      ...(group.length === 0 ? {} : { groupBy: group }),
      ...(having === undefined ? {} : { having }),
      orderBy: this.#orderBy(definition, alias, ctx, options.order),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
      ...(lock === undefined ? {} : { lock }),
    };
  }

  /**
   * Builds `SELECT count(...) AS "count"` for `count()`.
   *
   * @param definition - Model definition.
   * @param options - Select options with `col` / `distinct`.
   * @param inAsAnyThreshold - Lists at least this long compile to `= ANY($n)`.
   * @returns SELECT node.
   */
  count(
    definition: ModelDefinition,
    options: SelectOptions & Readonly<{ col?: string; distinct?: boolean }>,
    inAsAnyThreshold?: number,
  ): SelectNode {
    const alias = definition.name;
    const target: ExprNode =
      options.col === undefined
        ? options.distinct === true
          ? ast.ident(
              alias,
              definition.attributes.get(definition.primaryKeys[0] ?? 'id')?.field ?? 'id',
            )
          : { kind: 'star' }
        : this.#orderTarget(
            definition,
            alias,
            this.#columns.whereCompiler(definition, alias),
            options.col,
          );
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
    const ctx = this.#columns.whereCompiler(definition, alias);
    const groupColumns = this.#groupBy(definition, alias, ctx, options.group);
    const { order: _order, limit: _limit, offset: _offset, lock: _lock, ...rest } = options;
    return this.build(definition, rest, inAsAnyThreshold, [...groupColumns, count]);
  }

  /**
   * Builds `SELECT fn(field) AS "fn"` for `aggregate()`.
   *
   * @param definition - Model definition.
   * @param field - Attribute name or `'*'`.
   * @param aggregateFunction - Aggregate function name.
   * @param options - Select options with `distinct`.
   * @param inAsAnyThreshold - Lists at least this long compile to `= ANY($n)`.
   * @returns SELECT node.
   */
  aggregate(
    definition: ModelDefinition,
    field: string,
    aggregateFunction: string,
    options: SelectOptions & Readonly<{ distinct?: boolean }>,
    inAsAnyThreshold?: number,
  ): SelectNode {
    const alias = definition.name;
    const ctx = this.#columns.whereCompiler(definition, alias);
    const target =
      field === '*'
        ? ({ kind: 'star' } as const)
        : this.#orderTarget(definition, alias, ctx, field);
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
    return this.build(definition, rest, inAsAnyThreshold, [
      ...this.#groupBy(definition, alias, ctx, options.group),
      column,
    ]);
  }

  /**
   * Selected columns for the `attributes` option.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param attributes - `attributes` option.
   * @returns Column expressions.
   */
  columns(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    attributes: FindAttributeOptions | undefined,
  ): readonly ExprNode[] {
    const all = this.#columns.stored(definition).map((attribute) => attribute.fieldName);
    if (attributes === undefined || !Array.isArray(attributes)) {
      const spec = (attributes ?? {}) as AttributeSpec;
      const excluded = new Set(spec.exclude ?? []);
      return [
        ...all
          .filter((name) => !excluded.has(name))
          .map((name) => this.#columnFor(definition, alias, name)),
        ...(spec.include ?? []).map((item) => this.#attributeItem(definition, alias, ctx, item)),
      ];
    }
    return (attributes as readonly (string | readonly [unknown, string])[]).map((item) =>
      this.#attributeItem(definition, alias, ctx, item),
    );
  }

  /**
   * One `order` item.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param item - Attribute name, `[target, direction]` or expression.
   * @returns Order node.
   */
  orderItem(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    item: unknown,
  ): OrderNode {
    if (Array.isArray(item)) {
      const [target, direction]: readonly unknown[] = item;
      return {
        expr: this.#orderTarget(definition, alias, ctx, target),
        ...(direction === undefined ? {} : OrderDirection.parse(direction)),
      };
    }
    return { expr: this.#orderTarget(definition, alias, ctx, item) };
  }

  #columnFor(definition: ModelDefinition, alias: string, name: string): ExprNode {
    const attribute = definition.attributes.get(name);
    const column = ast.ident(alias, attribute?.field ?? name);
    return attribute === undefined || attribute.field === name
      ? column
      : { kind: 'alias', expr: column, alias: name };
  }

  #attributeItem(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    item: string | readonly [unknown, string],
  ): ExprNode {
    if (typeof item === 'string') {
      return this.#columnFor(definition, alias, item);
    }
    const [source, name] = item;
    const expr =
      typeof source === 'string'
        ? ast.ident(alias, definition.attributes.get(source)?.field ?? source)
        : ctx.toExpr(source);
    return { kind: 'alias', expr, alias: name };
  }

  /** `'jsonAttr.a.b'` orders by the jsonb value at that path (numbers sort numerically). */
  #jsonPathOrder(definition: ModelDefinition, alias: string, target: string): ExprNode | undefined {
    const [name = '', ...path] = target.split('.');
    const attribute = definition.attributes.get(name);
    return attribute === undefined ||
      path.length === 0 ||
      (attribute.type.key !== 'JSON' && attribute.type.key !== 'JSONB')
      ? undefined
      : ast.binary(
          '#>',
          attribute.type.key === 'JSON'
            ? { kind: 'cast', expr: ast.ident(alias, attribute.field), type: 'JSONB' }
            : ast.ident(alias, attribute.field),
          ast.param(path),
        );
  }

  #orderTarget(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    target: unknown,
  ): ExprNode {
    return typeof target === 'string'
      ? definition.attributes.has(target)
        ? ast.ident(alias, definition.attributes.get(target)?.field ?? target)
        : (this.#jsonPathOrder(definition, alias, target) ?? ast.ident(...target.split('.')))
      : ctx.toExpr(target);
  }

  #orderBy(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    order: Order,
  ): readonly OrderNode[] {
    return order === undefined || order === null
      ? []
      : Array.isArray(order)
        ? order.map((item: unknown) => this.orderItem(definition, alias, ctx, item))
        : order instanceof SqlExpression
          ? [{ expr: ctx.toExpr(order) }]
          : invalidOrder();
  }

  #groupBy(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    group: unknown,
  ): readonly ExprNode[] {
    return group === undefined
      ? []
      : (Array.isArray(group) ? group : [group]).map((item: unknown) =>
          this.#orderTarget(definition, alias, ctx, item),
        );
  }
}
