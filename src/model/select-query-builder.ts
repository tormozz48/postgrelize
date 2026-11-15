import type { ExprNode, FromItem, OrderNode, SelectNode, TableRef } from '../sql/ast.ts';
import type { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';
import { TableSampleBuilder } from './table-sample-builder.ts';
import { SelectLock } from './select-lock.ts';
import { SelectAggregates } from './select-aggregates.ts';
import type { FindAttributeOptions, SelectOptions } from './select-options.ts';
import { SelectTargets } from './select-targets.ts';

export type {
  AttributeSpec,
  FindAttributeOptions,
  LockOption,
  LockTarget,
  Order,
  OrderItem,
  SelectOptions,
} from './select-options.ts';

const definedNumber = (value: number | null | undefined): number | undefined =>
  value === null || value === undefined ? undefined : value;

/**
 * Builds SELECT statements of finders: columns from `attributes`, `where` / `having`, `order`,
 * `group`, `distinctOn`, `limit` / `offset`, row locks, and the `count()` / `aggregate()` forms.
 */
export class SelectQueryBuilder {
  readonly #columns: AttributeColumns;
  readonly #targets: SelectTargets;
  readonly #aggregates: SelectAggregates;
  readonly #locks = new SelectLock();
  readonly #samples = new TableSampleBuilder();

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
    this.#targets = new SelectTargets(columns);
    this.#aggregates = new SelectAggregates(columns, this.#targets);
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
    const clauses = this.#clauses(definition, alias, ctx, options);
    return {
      kind: 'select',
      ...SelectQueryBuilder.#sources(options),
      columns: columnsOverride ?? this.columns(definition, alias, ctx, options.attributes),
      from: this.#from(this.#columns.table(definition, alias), alias, options),
      ...clauses,
      orderBy: this.#targets.orderBy(definition, alias, ctx, options.order),
      ...SelectQueryBuilder.#window(options),
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
    const columns = this.#aggregates.count(definition, options);
    const { order: _order, limit: _limit, offset: _offset, lock: _lock, ...rest } = options;
    return this.build(definition, rest, inAsAnyThreshold, columns);
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
    const columns = this.#aggregates.aggregate(definition, field, aggregateFunction, options);
    const { order: _order, limit: _limit, offset: _offset, ...rest } = options;
    return this.build(definition, rest, inAsAnyThreshold, columns);
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
    return this.#targets.columns(definition, alias, ctx, attributes);
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
    return this.#targets.orderItem(definition, alias, ctx, item);
  }

  #clauses(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    options: SelectOptions,
  ): Partial<SelectNode> {
    const where = this.#columns.where(options.where, ctx);
    const having = this.#columns.where(options.having, ctx);
    const lock = this.#locks.of(options);
    const group = this.#targets.list(definition, alias, ctx, options.group);
    const distinctOn = this.#targets.distinctOn(definition, alias, ctx, options.distinctOn);
    return {
      ...(distinctOn.length === 0 ? {} : { distinctOn }),
      ...(where === undefined ? {} : { where }),
      ...(group.length === 0 ? {} : { groupBy: group }),
      ...(having === undefined ? {} : { having }),
      ...(lock === undefined ? {} : { lock }),
    };
  }

  #from(table: TableRef, alias: string, options: SelectOptions): FromItem {
    if (options.fromQuery !== undefined) {
      return { subquery: options.fromQuery, alias };
    }
    return options.sample === undefined
      ? table
      : { ...table, sample: this.#samples.build(options.sample) };
  }

  static #sources(options: SelectOptions): Partial<SelectNode> {
    return {
      ...(options.withClause === undefined ? {} : { with: options.withClause }),
      ...(options.extraFrom === undefined || options.extraFrom.length === 0
        ? {}
        : { extraFrom: options.extraFrom }),
    };
  }

  static #window(options: SelectOptions): Partial<SelectNode> {
    const limit = definedNumber(options.limit);
    const offset = definedNumber(options.offset);
    if (options.withTies === true && limit === undefined) {
      throw new Error('withTies requires a limit');
    }
    return {
      ...(limit === undefined ? {} : { limit }),
      ...(options.withTies === true ? { withTies: true } : {}),
      ...(offset === undefined ? {} : { offset }),
    };
  }
}
