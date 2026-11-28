import {
  Aggregate,
  ArraySlice,
  GroupingClause,
  type AggregateCallOptions,
  type ExpressionResult,
} from './aggregate-expressions.ts';
import type { SqlExpression } from './expression.ts';

/**
 * `array_agg(expr [ORDER BY ...])`. The result is `null` when no row is aggregated. PostgreSQL
 * extension.
 *
 * @postgrelize
 * @param expression - Attribute name or expression.
 * @param options - `distinct` and `orderBy` inside the call.
 * @returns Aggregate expression; `T` is the element type you expect from the driver.
 * @example
 * ```ts
 * await Post.findAll({
 *   attributes: ['userId', [arrayAgg<number>('id', { orderBy: [['createdAt', 'DESC']] }), 'ids']],
 *   group: ['userId'],
 * });
 * ```
 * @see {@link arraySlice}
 */
export const arrayAgg = <T = unknown>(
  expression: string | SqlExpression,
  options?: AggregateCallOptions,
): Aggregate<T[] | null> => new Aggregate('array_agg', [expression], options);

/**
 * `string_agg(expr, separator [ORDER BY ...])`. The separator is written into the SQL as an escaped
 * literal, like the string arguments of `fn()`. PostgreSQL extension.
 *
 * @postgrelize
 * @param expression - Attribute name or expression of a text type.
 * @param separator - Text between the values.
 * @param options - `distinct` and `orderBy` inside the call.
 * @returns Aggregate expression.
 * @throws Error when the separator is not a string.
 * @example
 * ```ts
 * await Post.findAll({
 *   attributes: ['userId', [stringAgg('title', ', ', { orderBy: ['title'] }), 'titles']],
 *   group: ['userId'],
 * });
 * ```
 */
export const stringAgg = (
  expression: string | SqlExpression,
  separator: string,
  options?: AggregateCallOptions,
): Aggregate<string | null> => {
  if (typeof separator !== 'string') {
    throw new Error('stringAgg() needs a string separator');
  }
  return new Aggregate('string_agg', [expression], options, separator);
};

/**
 * `jsonb_agg(expr [ORDER BY ...])`. PostgreSQL extension.
 *
 * @postgrelize
 * @param expression - Attribute name or expression, e.g. `fn('jsonb_build_object', ...)`.
 * @param options - `distinct` and `orderBy` inside the call.
 * @returns Aggregate expression; `T` is the element type you expect.
 * @example
 * ```ts
 * const post = fn('jsonb_build_object', 'id', col('id'));
 * await Post.findAll({
 *   attributes: ['userId', [jsonbAgg<{ id: number }>(post, { orderBy: ['id'] }), 'posts']],
 *   group: ['userId'],
 * });
 * ```
 */
export const jsonbAgg = <T = unknown>(
  expression: string | SqlExpression,
  options?: AggregateCallOptions,
): Aggregate<T[] | null> => new Aggregate('jsonb_agg', [expression], options);

/**
 * Array slice `(array)[from:to]`; both indexes are 1-based and included. PostgreSQL extension.
 *
 * @postgrelize
 * @param array - Array expression or attribute name.
 * @param from - First index; omit for the start.
 * @param to - Last index; omit for the end.
 * @returns Slice expression with the result type of `array`.
 * @throws Error when an index is not a safe integer.
 * @example
 * ```ts
 * const latest = arraySlice(arrayAgg<number>('id', { orderBy: [['createdAt', 'DESC']] }), 1, 3);
 * await Post.findAll({ attributes: ['userId', [latest, 'latest']], group: ['userId'] });
 * ```
 */
export const arraySlice = <E extends string | SqlExpression>(
  array: E,
  from?: number,
  to?: number,
): ArraySlice<ExpressionResult<E>> => new ArraySlice(array, from, to);

/**
 * `GROUPING(a, ...)`: bit mask telling which of the arguments are not part of the grouping set of
 * the current row (0 when all are grouped). PostgreSQL extension.
 *
 * @postgrelize
 * @param items - Attribute names or expressions listed in `group`.
 * @returns Integer expression for `attributes`, `having` and `order`.
 * @example
 * ```ts
 * await Product.findAll({
 *   attributes: ['category', [grouping('category'), 'isTotal'], [fn('sum', col('price')), 'sum']],
 *   group: [rollup(['category'])],
 * });
 * ```
 */
export const grouping = (...items: readonly (string | SqlExpression)[]): Aggregate<number> =>
  new Aggregate('GROUPING', items);

/**
 * `ROLLUP (...)` item of `group`: subtotals for every prefix of the list and a grand total.
 * PostgreSQL extension.
 *
 * @postgrelize
 * @param items - Attribute names or expressions; a nested list is one composite column.
 * @returns Group item.
 * @throws Error for an empty list.
 * @example
 * ```ts
 * await Product.findAll({
 *   attributes: ['category', 'name', [fn('sum', col('price')), 'sum']],
 *   group: [rollup(['category', 'name'])],
 * });
 * ```
 */
export const rollup = (items: readonly unknown[]): GroupingClause =>
  new GroupingClause('ROLLUP', items);

/**
 * `CUBE (...)` item of `group`: subtotals for every combination of the list. PostgreSQL extension.
 *
 * @postgrelize
 * @param items - Attribute names or expressions; a nested list is one composite column.
 * @returns Group item.
 * @throws Error for an empty list.
 * @example
 * ```ts
 * await Product.findAll({
 *   attributes: ['category', 'name', [fn('sum', col('price')), 'sum']],
 *   group: [cube(['category', 'name'])],
 * });
 * ```
 */
export const cube = (items: readonly unknown[]): GroupingClause =>
  new GroupingClause('CUBE', items);

/**
 * `GROUPING SETS (...)` item of `group`: one grouping per set; `[]` is the grand total. PostgreSQL
 * extension.
 *
 * @postgrelize
 * @param sets - Sets: a list of attribute names or expressions, a single one, or a nested
 *   {@link rollup} / {@link cube}.
 * @returns Group item.
 * @throws Error for an empty list of sets.
 * @example
 * ```ts
 * const dimensions = ['category', 'name'];
 * await Product.findAll({
 *   attributes: [...dimensions, [fn('sum', col('price')), 'sum']],
 *   group: [groupingSets([dimensions, ['category'], []])],
 * });
 * ```
 */
export const groupingSets = (sets: readonly unknown[]): GroupingClause =>
  new GroupingClause('GROUPING SETS', sets);
