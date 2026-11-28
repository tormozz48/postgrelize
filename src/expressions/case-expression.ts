import type { WhereOptions } from '../model/where-options.ts';
import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';

/** One `WHEN condition THEN value` branch of a {@link Case}. */
export type CaseBranch = Readonly<{
  /** Condition, in any form `where` accepts. */
  when: WhereOptions;
  /** Result when the condition is true: a value (bound) or an expression. */
  result: unknown;
}>;

/** `ELSE` result of a {@link Case}; the wrapper tells `ELSE NULL` from no `ELSE`. */
export type CaseElse = Readonly<{
  /** Result when no branch matches. */
  value: unknown;
}>;

/**
 * Searched `CASE WHEN ... THEN ... ELSE ... END` expression. Created by {@link caseWhen}; every
 * call returns a new instance, so a partial expression can be reused. PostgreSQL extension.
 */
export class Case extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Case';
  /** `WHEN` branches in evaluation order. */
  readonly branches: readonly CaseBranch[];
  /** `ELSE` result; absent without {@link Case.else} (the expression is then `NULL`). */
  readonly otherwise?: CaseElse;

  /**
   * @param branches - `WHEN` branches.
   * @param otherwise - `ELSE` result.
   */
  constructor(branches: readonly CaseBranch[], otherwise?: CaseElse) {
    super();
    this.branches = branches;
    if (otherwise !== undefined) {
      this.otherwise = otherwise;
    }
    Object.freeze(this);
  }

  /**
   * Adds a `WHEN condition THEN value` branch.
   *
   * Strings, `null` and other values are bound as parameters; numbers, bigints, booleans and dates
   * are bound with a cast so PostgreSQL does not read them as text. Expressions are rendered as is.
   *
   * @param condition - Anything `where` accepts: attribute hash, `Op.and` / `Op.or`, `where()`.
   * @param value - Result of the branch.
   * @returns New expression with the branch appended.
   * @example
   * ```ts
   * const rank = caseWhen().when({ status: 'open' }, 1).when({ status: 'done' }, 2);
   * ```
   */
  when(condition: WhereOptions, value: unknown): Case {
    return new Case([...this.branches, { when: condition, result: value }], this.otherwise);
  }

  /**
   * Sets the `ELSE` result, replacing an earlier one.
   *
   * @param value - Result when no branch matches.
   * @returns New expression with the `ELSE` result.
   * @example
   * ```ts
   * const label = caseWhen().when({ qty: 0 }, 'empty').else('stocked');
   * ```
   */
  else(value: unknown): Case {
    return new Case(this.branches, { value });
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitCase(this);
  }
}

/**
 * Starts a `CASE` expression for `attributes`, `where`, `order`, `group` and `having`. Add at least
 * one branch with {@link Case.when}. PostgreSQL extension.
 *
 * @postgrelize
 * @returns Empty `CASE` expression.
 * @example
 * ```ts
 * const rank = caseWhen().when({ status: 'open' }, 1).when({ status: 'done' }, 2).else(3);
 * await Task.findAll({ attributes: ['id', [rank, 'rank']], order: [[rank, 'ASC']] });
 * ```
 */
export const caseWhen = (): Case => new Case([]);
