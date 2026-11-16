import { Cast, Col, Fn } from './call-expressions.ts';
import { Excluded, Json, Where } from './condition-expressions.ts';
import { SqlExpression, type SqlExpressionVisitor } from './expression.ts';
import { Exists, type Subquery } from './query-expressions.ts';
import { Over, Tuple } from './row-expressions.ts';

export { Cast, Col, Fn } from './call-expressions.ts';
export { Excluded, Json, Where } from './condition-expressions.ts';
export { SqlExpression, type SqlExpressionVisitor } from './expression.ts';
export { Exists, Subquery, WriteStatement, type SetOperationOptions } from './query-expressions.ts';
export { Over, Tuple } from './row-expressions.ts';

// Kept in the module of the factories: a second copy of this module (another package build) then
// has its own class, which the cross-copy instance check tests rely on.
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
 * @example
 * ```ts
 * await Post.findAll({ attributes: [[fn('count', col('Post.id')), 'total']], group: [col('Post.userId')] });
 * ```
 */
export const col = (name: string): Col => new Col(name);

/**
 * Creates a type cast `CAST(value AS type)`.
 *
 * @param val - Value or expression to cast.
 * @param type - PostgreSQL type name, e.g. `'integer'`.
 * @returns Cast expression.
 * @example
 * ```ts
 * await Product.findAll({ attributes: [[cast(col('price'), 'integer'), 'rounded']] });
 * ```
 */
export const cast = (val: unknown, type: string): Cast => new Cast(val, type);

/**
 * Accesses a JSON(B) value by path (`json('meta.a.b')`) or builds JSON conditions
 * (`json({ meta: { a: 1 } })`).
 *
 * @param conditionsOrPath - Dot-separated path, starting with the attribute name, or a conditions object.
 * @param value - Value to compare with when a path is given.
 * @returns JSON expression.
 * @example
 * ```ts
 * await User.findAll({ where: json('meta.address.city', 'Berlin') });
 * await User.findAll({ where: json({ meta: { active: true } }) });
 * ```
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
 * @example
 * ```ts
 * await User.findAll({ where: where(fn('lower', col('name')), 'bob') });
 * await User.findAll({ where: where(col('age'), Op.gt, 18) });
 * ```
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
 * const rows = [{ key: 'home', hits: 1 }];
 * await Product.bulkCreate(rows, {
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
 * @example
 * ```ts
 * await User.findAll({ where: notExists(Post.subquery({ where: { userId: col('User.id') } })) });
 * ```
 */
export const notExists = (subquery: Subquery): Exists => new Exists(subquery, true);

/**
 * Window definition of {@link over}.
 *
 * @example
 * ```ts
 * const window: WindowOptions = { partitionBy: ['userId'], orderBy: [['createdAt', 'DESC']] };
 * ```
 */
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
 * @example
 * ```ts
 * await Post.findAll({
 *   attributes: ['id', [over(fn('row_number'), { partitionBy: ['userId'], orderBy: [['createdAt', 'DESC']] }), 'rank']],
 * });
 * ```
 */
export const over = (windowFunction: Fn | Literal, window: WindowOptions = {}): Over =>
  new Over(windowFunction, window.partitionBy ?? [], window.orderBy ?? []);

/**
 * Row constructor for row comparisons: `where(tuple(col('createdAt'), col('id')), Op.lt, tuple(date, id))`.
 * PostgreSQL extension.
 *
 * @param items - Row items (values or expressions).
 * @returns Row expression.
 * @example
 * ```ts
 * const cursor = new Date();
 * await Post.findAll({ where: where(tuple(col('createdAt'), col('id')), Op.lt, tuple(cursor, 100)) });
 * ```
 */
export const tuple = (...items: readonly unknown[]): Tuple => new Tuple(items);
