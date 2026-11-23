import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';

/** JSON path access or JSON conditions. Created by {@link json}. */
export class Json extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Json';
  /** Dot-separated path starting with the attribute name. */
  readonly path?: string;
  /** Conditions object. */
  readonly conditions?: object;
  /** Value compared with the path (`undefined`: no comparison). */
  readonly value?: string | number | boolean | null;

  /**
   * @param conditionsOrPath - Dot-separated path or conditions object.
   * @param value - Value compared with the path.
   */
  constructor(conditionsOrPath: string | object, value?: string | number | boolean | null) {
    super();
    if (typeof conditionsOrPath === 'string') {
      this.path = conditionsOrPath;
      this.value = value;
    } else {
      this.conditions = conditionsOrPath;
    }
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitJson(this);
  }
}

/** Comparison of an arbitrary expression with a value. Created by {@link where}. */
export class Where extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Where';
  /** Left-hand expression. */
  readonly attribute: unknown;
  /** Comparison operator. */
  readonly comparator: string | symbol;
  /** Right-hand value. */
  readonly logic: unknown;

  /**
   * @param attribute - Left-hand expression.
   * @param comparator - Comparison operator.
   * @param logic - Right-hand value.
   */
  constructor(attribute: unknown, comparator: string | symbol, logic: unknown) {
    super();
    this.attribute = attribute;
    this.comparator = comparator;
    this.logic = logic;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitWhere(this);
  }
}

/** Reference to a column of the row proposed for insertion in `ON CONFLICT DO UPDATE`. Created by {@link excluded}. */
export class Excluded extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Excluded';
  /** Attribute name. */
  readonly column: string;

  /**
   * @param column - Attribute name.
   */
  constructor(column: string) {
    super();
    this.column = column;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitExcluded(this);
  }
}
