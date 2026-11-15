import type { SelectNode } from '../sql/ast.ts';

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
  /** Visits a {@link Tuple}. */
  visitTuple(expression: Tuple): R;
}

/**
 * Any expression builder accepted where Sequelize v6 accepts a `SequelizeMethod`. Instances are
 * immutable.
 */
// Shared through the global symbol registry so that expressions built by another copy of the
// package (e.g. the CommonJS build next to the ES module build) are still recognised.
const KIND: unique symbol = Symbol.for('postgrelize.expression') as never;

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

const FUNCTION_NAME = /^[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?$/;

const TYPE_NAME = /^[A-Za-z_][\w ]*(?:\(\s*\d+\s*(?:,\s*\d+\s*)?\))?(?:\[\])*$/;

/** Raw SQL fragment inserted into a query as-is. Created by {@link literal}. */
export class Literal extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Literal';
  /** SQL text. */
  readonly val: string;

  /**
   * @param val - SQL text.
   */
  constructor(val: string) {
    super();
    this.val = val;
    Object.freeze(this);
  }

  /** @internal */
  accept<R>(visitor: SqlExpressionVisitor<R>): R {
    return visitor.visitLiteral(this);
  }
}

/** SQL function call. Created by {@link fn}. */
export class Fn extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Fn';
  /** Function name. */
  readonly fn: string;
  /** Arguments. */
  readonly args: readonly unknown[];

  /**
   * @param fn - Function name; must be a plain or schema-qualified identifier.
   * @param args - Arguments.
   */
  constructor(fn: string, args: readonly unknown[]) {
    super();
    if (!FUNCTION_NAME.test(fn)) {
      throw new Error(`Invalid function name: ${fn}`);
    }
    this.fn = fn;
    this.args = args;
    Object.freeze(this);
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

/** JSON path access or JSON conditions. Created by {@link json}. */
export class Json extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Json';
  /** Dot-separated path starting with the attribute name. */
  readonly path?: string;
  /** Conditions object. */
  readonly conditions?: object;
  /** Value compared with the path (`undefined`: no comparison). */
  readonly value?: unknown;

  /**
   * @param conditionsOrPath - Dot-separated path or conditions object.
   * @param value - Value compared with the path.
   */
  constructor(conditionsOrPath: string | object, value?: unknown) {
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

/** Window function call `fn OVER (...)`. Created by {@link over}. */
export class Over extends SqlExpression {
  /** @internal */
  static override readonly kind = 'Over';
  /** Window function, e.g. `fn('row_number')`. */
  readonly fn: Fn | Literal;
  /** `PARTITION BY` attributes or expressions. */
  readonly partitionBy: readonly unknown[];
  /** `ORDER BY` items: attribute, `[attribute, direction]` or expression. */
  readonly orderBy: readonly unknown[];

  /**
   * @param fn - Window function.
   * @param partitionBy - `PARTITION BY` items.
   * @param orderBy - `ORDER BY` items.
   */
  constructor(fn: Fn | Literal, partitionBy: readonly unknown[], orderBy: readonly unknown[]) {
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

/**
 * Creates a raw SQL fragment. The text is not escaped — never pass user input.
 *
 * @param val - SQL text.
 * @returns Literal expression.
 * @example
 * ```ts
 * await Post.findAll({ order: [literal('"createdAt" DESC NULLS LAST')] });
 * ```
 */
export const literal = (val: string): Literal => new Literal(val);

/**
 * Creates an SQL function call. Arguments are bound as parameters unless they are expressions.
 *
 * @param name - Function name, e.g. `'lower'`.
 * @param args - Function arguments.
 * @returns Function call expression.
 * @example
 * ```ts
 * await User.findAll({ where: where(fn('lower', col('email')), 'a@b.c') });
 * ```
 */
export const fn = (name: string, ...args: readonly unknown[]): Fn => new Fn(name, args);

/**
 * Creates a column reference. Dots separate table and column: `'user.id'`.
 *
 * @param name - Column name, optionally prefixed with a table alias.
 * @returns Column expression.
 */
export const col = (name: string): Col => new Col(name);

/**
 * Creates a type cast `CAST(value AS type)`.
 *
 * @param val - Value or expression to cast.
 * @param type - PostgreSQL type name, e.g. `'integer'`.
 * @returns Cast expression.
 */
export const cast = (val: unknown, type: string): Cast => new Cast(val, type);

/**
 * Accesses a JSON(B) value by path (`json('meta.a.b')`) or builds JSON conditions
 * (`json({ meta: { a: 1 } })`).
 *
 * @param conditionsOrPath - Dot-separated path, starting with the attribute name, or a conditions object.
 * @param value - Value to compare with when a path is given.
 * @returns JSON expression.
 */
export const json = (conditionsOrPath: string | object, value?: unknown): Json =>
  new Json(conditionsOrPath, value);

/** Call signatures of {@link where}. */
export type WhereFactory = {
  /**
   * @param attribute - Left-hand expression.
   * @param logic - Right-hand value or condition object, compared with `=`.
   */
  (attribute: unknown, logic: unknown): Where;
  /**
   * @param attribute - Left-hand expression.
   * @param comparator - `Op.*` symbol or SQL operator string such as `'>='`.
   * @param logic - Right-hand value.
   */
  (attribute: unknown, comparator: string | symbol, logic: unknown): Where;
};

/**
 * Compares an expression with a value: `where(fn('lower', col('name')), 'bob')` or
 * `where(col('age'), Op.gt, 18)`.
 *
 * @returns Where expression.
 */
export const where: WhereFactory = (
  attribute: unknown,
  ...rest: readonly [unknown] | readonly [string | symbol, unknown]
): Where =>
  rest.length === 1 ? new Where(attribute, '=', rest[0]) : new Where(attribute, rest[0], rest[1]);

/**
 * References the value proposed for insertion (`EXCLUDED."column"`) inside an `onConflict`
 * update. PostgreSQL extension.
 *
 * @param attribute - Model attribute name.
 * @returns Excluded column expression.
 * @example
 * ```ts
 * await Counter.bulkCreate(rows, {
 *   onConflict: { target: ['key'], action: { update: { hits: excluded('hits') } } },
 * });
 * ```
 */
export const excluded = (attribute: string): Excluded => new Excluded(attribute);

/**
 * `EXISTS (subquery)`. PostgreSQL extension.
 *
 * @param subquery - Subquery from `Model.subquery()`.
 * @returns Condition usable as `where`.
 * @example
 * ```ts
 * await User.findAll({ where: exists(Post.subquery({ where: { userId: col('User.id') } })) });
 * ```
 */
export const exists = (subquery: Subquery): Exists => new Exists(subquery, false);

/**
 * `NOT EXISTS (subquery)`. PostgreSQL extension.
 *
 * @param subquery - Subquery from `Model.subquery()`.
 * @returns Condition usable as `where`.
 */
export const notExists = (subquery: Subquery): Exists => new Exists(subquery, true);

/** Window definition of {@link over}. */
export type WindowOptions = Readonly<{
  /** `PARTITION BY` attributes or expressions. */
  partitionBy?: readonly unknown[];
  /** `ORDER BY` items: attribute, `[attribute, direction]` or expression. */
  orderBy?: readonly unknown[];
}>;

/**
 * Window function call: `over(fn('row_number'), { partitionBy: ['userId'], orderBy: [['createdAt', 'DESC']] })`.
 * PostgreSQL extension.
 *
 * @param windowFunction - Function call, e.g. `fn('rank')`.
 * @param window - Partition and order.
 * @returns Expression usable in `attributes` and `order`.
 */
export const over = (windowFunction: Fn | Literal, window: WindowOptions = {}): Over =>
  new Over(windowFunction, window.partitionBy ?? [], window.orderBy ?? []);

/**
 * Row constructor for row comparisons: `where(tuple(col('createdAt'), col('id')), Op.lt, tuple(date, id))`.
 * PostgreSQL extension.
 *
 * @param items - Row items (values or expressions).
 * @returns Row expression.
 */
export const tuple = (...items: readonly unknown[]): Tuple => new Tuple(items);
