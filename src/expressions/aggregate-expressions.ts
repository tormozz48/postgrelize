import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';

/**
 * Options of {@link arrayAgg}, {@link stringAgg} and {@link jsonbAgg}. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: AggregateCallOptions = { distinct: true, orderBy: [['title', 'ASC NULLS LAST']] };
 * ```
 */
export type AggregateCallOptions = Readonly<{
  /**
   * Aggregate only distinct values (`DISTINCT` inside the call). PostgreSQL then requires every
   * `orderBy` expression to be one of the aggregate arguments.
   *
   * @defaultValue false
   */
  distinct?: boolean;
  /**
   * `ORDER BY` inside the call: attribute names, `[attribute, direction]` or expressions.
   *
   * @defaultValue []
   */
  orderBy?: readonly unknown[];
}>;

/**
 * Value type carried by {@link Aggregate} and {@link ArraySlice}: what the selected column holds.
 * `never` for other expressions. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const ids = arrayAgg<number>('id');
 * const row: { ids: ExpressionResult<typeof ids> } = { ids: [1, 2] };
 * ```
 */
export type ExpressionResult<E> = E extends {
  /** Phantom type of the value; never set at run time. */
  readonly resultType?: infer R;
}
  ? R
  : never;

/**
 * Aggregate call with `DISTINCT` / `ORDER BY` inside it, or `GROUPING(...)`. Strings among the
 * arguments are attribute names. Created by {@link arrayAgg}, {@link stringAgg},
 * {@link jsonbAgg} and {@link grouping}. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const ids: Aggregate<number[] | null> = arrayAgg<number>('id');
 * ```
 */
export class Aggregate<T = unknown> extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Aggregate';
  /** Type of the result; exists only for the compiler, never set at run time. */
  declare readonly resultType?: T;
  /** Function name. */
  readonly name: string;
  /** Aggregated attribute or expression, then the other arguments. */
  readonly args: readonly unknown[];
  /** `DISTINCT` and `ORDER BY` inside the call. */
  readonly options: AggregateCallOptions;
  /** @internal Separator of `string_agg`: written as a literal, not read as an attribute. */
  readonly separator: string | undefined;

  /**
   * @param name - Function name.
   * @param args - Attribute names or expressions.
   * @param options - `DISTINCT` and `ORDER BY`.
   * @param separator - Separator of `string_agg`.
   */
  constructor(
    name: string,
    args: readonly unknown[],
    options: AggregateCallOptions = {},
    separator?: string,
  ) {
    super();
    this.name = name;
    this.args = args;
    this.options = options;
    this.separator = separator;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitAggregate(this);
  }
}

/** Array slice `(array)[from:to]`. Created by {@link arraySlice}. PostgreSQL extension. */
export class ArraySlice<T = unknown> extends SqlExpression {
  /** @internal */
  static override readonly kind = 'ArraySlice';
  /** Type of the result; exists only for the compiler, never set at run time. */
  declare readonly resultType?: T;
  /** Sliced array expression or attribute name. */
  readonly array: unknown;
  /** First index (1-based); the start of the array when omitted. */
  readonly from: number | undefined;
  /** Last index, included; the end of the array when omitted. */
  readonly to: number | undefined;

  /**
   * @param array - Array expression or attribute name.
   * @param from - First index.
   * @param to - Last index.
   */
  constructor(array: unknown, from: number | undefined, to: number | undefined) {
    super();
    this.array = array;
    this.from = ArraySlice.#bound(from);
    this.to = ArraySlice.#bound(to);
    Object.freeze(this);
  }

  // the bounds are written into the SQL text
  static #bound(bound: number | undefined): number | undefined {
    if (bound !== undefined && !Number.isSafeInteger(bound)) {
      throw new Error(`Invalid array slice bound: ${String(bound)}`);
    }
    return bound;
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitArraySlice(this);
  }
}

/**
 * `ROLLUP`, `CUBE` or `GROUPING SETS` item of `group`. Created by {@link rollup}, {@link cube} and
 * {@link groupingSets}. PostgreSQL extension.
 */
export class GroupingClause extends SqlExpression {
  /** @internal */
  static override readonly kind = 'GroupingClause';
  /** Clause keyword. */
  readonly type: 'ROLLUP' | 'CUBE' | 'GROUPING SETS';
  /** Attribute names, expressions, or lists of them (one parenthesized group). */
  readonly items: readonly unknown[];

  /**
   * @param type - Clause keyword.
   * @param items - Grouped items; at least one.
   */
  constructor(type: 'ROLLUP' | 'CUBE' | 'GROUPING SETS', items: readonly unknown[]) {
    super();
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`${type} needs at least one item`);
    }
    this.type = type;
    this.items = [...items];
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitGroupingClause(this);
  }
}
