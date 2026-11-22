import type { ModifyingNode, QueryNode, SetOperator } from '../sql/ast.ts';
import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';

/**
 * Options of {@link Subquery.union}, {@link Subquery.intersect} and {@link Subquery.except}. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const opts: SetOperationOptions = { all: true };
 * const rows = Post.subquery({ attributes: ['userId'] }).union(Task.subquery({ attributes: ['userId'] }), opts);
 * ```
 */
export type SetOperationOptions = Readonly<{
  /**
   * Keep duplicate rows (`UNION ALL`, `INTERSECT ALL`, `EXCEPT ALL`).
   *
   * @defaultValue false
   */
  all?: boolean;
}>;

/**
 * SELECT embedded in another statement. Created by `Model.subquery()`, or by combining subqueries
 * with a set operation. PostgreSQL extension.
 */
export class Subquery extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Subquery';
  /** Builds the query AST (called when the outer statement is compiled). */
  readonly build: () => QueryNode;

  /**
   * @param build - Builds the query AST.
   */
  constructor(build: () => QueryNode) {
    super();
    this.build = build;
    Object.freeze(this);
  }

  /**
   * Rows of this query or of `other`, without duplicates unless `all` is set (`UNION`).
   *
   * Both queries must select the same number of columns of compatible types. Use the result
   * wherever a subquery fits: `source`, `with`, `Op.in`, `insertFrom`, `merge`.
   *
   * @param other - Query to combine with.
   * @param options - `all` keeps duplicates.
   * @returns Combined subquery.
   * @example
   * ```ts
   * const ids = Post.subquery({ attributes: ['userId'] }).union(Task.subquery({ attributes: ['userId'] }));
   * const users = await User.findAll({ where: { id: { [Op.in]: ids } } });
   * ```
   */
  union(other: Subquery, options?: SetOperationOptions): Subquery {
    return this.#combine('UNION', other, options);
  }

  /**
   * Rows that are in both this query and `other` (`INTERSECT`).
   *
   * @param other - Query to intersect with.
   * @param options - `all` keeps duplicates.
   * @returns Combined subquery.
   * @example
   * ```ts
   * const both = Post.subquery({ attributes: ['userId'] }).intersect(Task.subquery({ attributes: ['userId'] }));
   * ```
   */
  intersect(other: Subquery, options?: SetOperationOptions): Subquery {
    return this.#combine('INTERSECT', other, options);
  }

  /**
   * Rows of this query that are not in `other` (`EXCEPT`).
   *
   * @param other - Query whose rows are removed.
   * @param options - `all` keeps duplicates.
   * @returns Combined subquery.
   * @example
   * ```ts
   * const quiet = User.subquery({ attributes: ['id'] }).except(Post.subquery({ attributes: ['userId'] }));
   * ```
   */
  except(other: Subquery, options?: SetOperationOptions): Subquery {
    return this.#combine('EXCEPT', other, options);
  }

  #combine(op: SetOperator, other: Subquery, options: SetOperationOptions | undefined): Subquery {
    return new Subquery(() => ({
      kind: 'setop',
      op,
      all: options?.all === true,
      left: this.build(),
      right: other.build(),
    }));
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitSubquery(this);
  }
}

/** `EXISTS (subquery)` / `NOT EXISTS (subquery)`. Created by {@link exists} / {@link notExists}. */
export class Exists extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Exists';
  /** The wrapped `SELECT` that `EXISTS` tests for rows. */
  readonly subquery: Subquery;
  /** `NOT EXISTS`. */
  readonly negated: boolean;

  /**
   * @param subquery - Subquery.
   * @param negated - `NOT EXISTS`.
   */
  constructor(subquery: Subquery, negated: boolean) {
    super();
    this.subquery = subquery;
    this.negated = negated;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitExists(this);
  }
}

/**
 * INSERT, UPDATE or DELETE statement for a data-modifying CTE. Created by `Model.insertStatement()`,
 * `Model.updateStatement()` and `Model.deleteStatement()`; not executed on its own. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const moved = Task.deleteStatement({ where: { done: true }, returning: true });
 * const rows = await Task.findAll({ with: { moved }, source: 'moved' });
 * ```
 */
export class WriteStatement {
  /** Builds the statement AST (called when the outer statement is compiled). */
  readonly build: () => ModifyingNode;

  /**
   * @param build - Builds the statement AST.
   */
  constructor(build: () => ModifyingNode) {
    this.build = build;
    Object.freeze(this);
  }
}
