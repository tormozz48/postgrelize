import type { Cast, Col, Filter, Fn } from './call-expressions.ts';
import type { Excluded, Json, Where } from './condition-expressions.ts';
import type { Literal } from './methods.ts';
import type { Exists, Subquery } from './query-expressions.ts';
import type { Over, Tuple } from './row-expressions.ts';

/**
 * Operations over every expression class (double dispatch through {@link SqlExpression.accept}).
 *
 * @internal
 */
export interface SqlExpressionVisitor<R> {
  /** Visits a {@link Literal}. */
  visitLiteral(expression: Literal): R;
  /** Visits a {@link Fn}. */
  visitFn(expression: Fn): R;
  /** Visits a {@link Col}. */
  visitCol(expression: Col): R;
  /** Visits a {@link Cast}. */
  visitCast(expression: Cast): R;
  /** Visits a {@link Json}. */
  visitJson(expression: Json): R;
  /** Visits a {@link Where}. */
  visitWhere(expression: Where): R;
  /** Visits a {@link Excluded}. */
  visitExcluded(expression: Excluded): R;
  /** Visits a {@link Subquery}. */
  visitSubquery(expression: Subquery): R;
  /** Visits a {@link Exists}. */
  visitExists(expression: Exists): R;
  /** Visits a {@link Over}. */
  visitOver(expression: Over): R;
  /** Visits a {@link Filter}. */
  visitFilter(expression: Filter): R;
  /** Visits a {@link Tuple}. */
  visitTuple(expression: Tuple): R;
}

// Shared through the global symbol registry so that expressions built by another copy of the
// package (e.g. the CommonJS build next to the ES module build) are still recognised.
const KIND: unique symbol = Symbol.for('postgrelize.expression') as never;

/**
 * Any expression builder accepted where Sequelize v6 accepts a `SequelizeMethod`. Instances are
 * immutable.
 */
export abstract class SqlExpression {
  /** @internal Expression kind; set by every concrete class. */
  static readonly kind: string = 'SqlExpression';

  constructor() {
    Object.defineProperty(this, KIND, { value: (new.target as typeof SqlExpression).kind });
  }

  /**
   * `instanceof` by kind tag instead of prototype chain, so it works across package copies.
   *
   * @param value - Value to test.
   * @returns True when `value` is an expression of this class (any expression for the base class).
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const kind = (value as { [KIND]?: unknown })[KIND];
    return typeof kind === 'string' && (this === SqlExpression || this.kind === kind);
  }

  /** @internal Dispatches to the visitor method of the concrete expression class. */
  abstract accept<R>(visitor: SqlExpressionVisitor<R>): R;
}
