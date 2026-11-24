import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';

const FUNCTION_NAME = /^[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?$/;

const TYPE_NAME = /^[A-Za-z_][\w ]*(?:\(\s*\d+\s*(?:,\s*\d+\s*)?\))?(?:\[\])*$/;

/** SQL function call. Created by {@link fn}. */
export class Fn extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Fn';
  /** Function name. */
  readonly fn: string;
  /** Arguments. */
  readonly args: readonly unknown[];
  /**
   * Write string arguments into the SQL as escaped literals like v6 (set by {@link fn}); the
   * internal helpers leave it off, so their strings stay bound parameters.
   *
   * @internal
   */
  readonly inlineStrings: boolean;

  /**
   * @param fn - Function name; must be a plain or schema-qualified identifier.
   * @param args - Arguments.
   * @param inlineStrings - Internal: render string arguments inline.
   */
  constructor(fn: string, args: readonly unknown[], inlineStrings = false) {
    super();
    this.fn = Fn.validName(fn);
    this.args = args;
    this.inlineStrings = inlineStrings;
    Object.freeze(this);
  }

  /**
   * Checks that a function name is a plain or schema-qualified identifier.
   *
   * @internal
   */
  static validName(name: string): string {
    if (typeof name !== 'string' || !FUNCTION_NAME.test(name)) {
      throw new Error(`Invalid function name: ${String(name)}`);
    }
    return name;
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitFn(this);
  }
}

/** Column reference. Created by {@link col}. */
export class Col extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Col';
  /** Column name or path. */
  readonly col: string | readonly string[];

  /**
   * @param col - Column name or path.
   */
  constructor(col: string | readonly string[]) {
    super();
    this.col = col;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitCol(this);
  }
}

/** Type cast `CAST(value AS type)`. Created by {@link cast}. */
export class Cast extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Cast';
  /** Value or expression to cast. */
  readonly val: unknown;
  /** Target type. */
  readonly type: string;
  /** Kept for Sequelize v6 compatibility. */
  readonly json: boolean = false;

  /**
   * @param val - Value or expression to cast.
   * @param type - PostgreSQL type name.
   */
  constructor(val: unknown, type: string) {
    super();
    if (!TYPE_NAME.test(type.trim())) {
      throw new Error(`Invalid cast type: ${type}`);
    }
    this.val = val;
    this.type = type.trim();
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitCast(this);
  }
}
