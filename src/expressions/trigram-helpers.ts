import { Fn } from './call-expressions.ts';
import { Where } from './condition-expressions.ts';

/**
 * `similarity(a, b)` of `pg_trgm`: trigram similarity from 0 to 1. PostgreSQL extension; needs
 * `CREATE EXTENSION pg_trgm`.
 *
 * @postgrelize
 * @param left - Text expression, e.g. `col('name')`.
 * @param right - Text expression or value (bound as a parameter).
 * @returns Function call expression.
 * @example
 * ```ts
 * await User.findAll({ order: [[trigramSimilarity(col('name'), 'jon'), 'DESC']], limit: 5 });
 * ```
 */
export const trigramSimilarity = (left: unknown, right: unknown): Fn =>
  new Fn('similarity', [left, right]);

/**
 * `word_similarity(a, b)` of `pg_trgm`: similarity of `a` to the best matching part of `b`. PostgreSQL extension.
 *
 * @postgrelize
 * @param left - Text expression or value, the searched word.
 * @param right - Text expression, e.g. `col('body')`.
 * @returns Function call expression.
 * @example
 * ```ts
 * await Post.findAll({ attributes: [[trigramWordSimilarity('postgre', col('title')), 'score']] });
 * ```
 */
export const trigramWordSimilarity = (left: unknown, right: unknown): Fn =>
  new Fn('word_similarity', [left, right]);

/**
 * `left <-> right` of `pg_trgm`: trigram distance (`1 - similarity`), served by GiST trigram
 * indexes for nearest-neighbour `order`. PostgreSQL extension.
 *
 * @postgrelize
 * @param left - Text expression, e.g. `col('name')`.
 * @param right - Text expression or value (bound as a parameter).
 * @returns Where expression usable in `order` and `attributes`.
 * @example
 * ```ts
 * await User.findAll({ order: [[trigramDistance(col('name'), 'jon'), 'ASC']], limit: 5 });
 * ```
 */
export const trigramDistance = (left: unknown, right: unknown): Where =>
  new Where(left, '<->', right);
