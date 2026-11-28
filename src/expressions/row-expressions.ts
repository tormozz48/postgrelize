import type { Filter, Fn } from './call-expressions.ts';
import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';
import type { Literal } from './methods.ts';

/** Window function call `fn OVER (...)`. Created by {@link over}. */
export class Over extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Over';
  /** Window function, e.g. `fn('row_number')`. */
  readonly fn: Fn | Filter | Literal;
  /** `PARTITION BY` attributes or expressions. */
  readonly partitionBy: readonly unknown[];
  /** `ORDER BY` items: attribute, `[attribute, direction]` or expression. */
  readonly orderBy: readonly unknown[];

  /**
   * @param fn - Window function.
   * @param partitionBy - `PARTITION BY` items.
   * @param orderBy - `ORDER BY` items.
   */
  constructor(
    fn: Fn | Filter | Literal,
    partitionBy: readonly unknown[],
    orderBy: readonly unknown[],
  ) {
    super();
    this.fn = fn;
    this.partitionBy = partitionBy;
    this.orderBy = orderBy;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitOver(this);
  }
}

/** Row constructor `(a, b, ...)` for row comparisons. Created by {@link tuple}. */
export class Tuple extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Tuple';
  /** Row items. */
  readonly items: readonly unknown[];

  /**
   * @param items - Row items.
   */
  constructor(items: readonly unknown[]) {
    super();
    this.items = items;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitTuple(this);
  }
}
