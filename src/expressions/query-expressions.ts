import type { SelectNode } from '../sql/ast.ts';
import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';

/** SELECT embedded in another statement. Created by `Model.subquery()`. PostgreSQL extension. */
export class Subquery extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Subquery';
  /** Builds the SELECT AST (called when the outer statement is compiled). */
  readonly build: () => SelectNode;

  /**
   * @param build - Builds the SELECT AST.
   */
  constructor(build: () => SelectNode) {
    super();
    this.build = build;
    Object.freeze(this);
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
  /** Subquery. */
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
