import type { Subquery } from '../expressions/methods.ts';
import type { WhereOptions } from './types.ts';

/**
 * One `WHEN MATCHED` / `WHEN NOT MATCHED BY SOURCE` action of `merge`.
 *
 * Set exactly one of `update`, `delete` or `nothing`.
 *
 * @example
 * ```ts
 * const action: MergeMatchedAction<Product> = { where: { active: true }, update: { price: col('source.price') } };
 * ```
 */
export interface MergeMatchedAction<T> {
  /** Extra condition (`WHEN MATCHED AND ...`). */
  readonly where?: WhereOptions<T> | unknown;
  /** Update the target row with these values / expressions (`col('source.attr')`). */
  readonly update?: Partial<Record<keyof T & string, unknown>>;
  /** Delete the target row. */
  readonly delete?: true;
  /** Do nothing. */
  readonly nothing?: true;
}

/**
 * `WHEN NOT MATCHED` action of `merge`.
 *
 * Set `insert` or `nothing`.
 *
 * @example
 * ```ts
 * const action: MergeInsertAction<Product> = { insert: { sku: col('source.sku'), price: 0 } };
 * ```
 */
export interface MergeInsertAction<T> {
  /** Extra condition (`WHEN NOT MATCHED AND ...`); may reference only source columns. */
  readonly where?: unknown;
  /** Values to insert: `true` copies same-named source columns, or a map of values / expressions. */
  readonly insert?: true | Partial<Record<keyof T & string, unknown>>;
  /** Do nothing. */
  readonly nothing?: true;
}

/**
 * Options of `Model.merge`, which runs a `MERGE` statement. PostgreSQL extension. PostgreSQL 15+ (RETURNING: 17+).
 *
 * Rows of the model table are the target; `source` rows or a subquery are the source.
 *
 * @postgrelize
 * @see {@link Model.merge}
 *
 * @example
 * ```ts
 * const opts: MergeOptions<Product> = {
 *   source: [{ sku: 'a1', price: 10 }],
 *   on: { sku: col('source.sku') },
 *   whenMatched: { update: { price: col('source.price') } },
 *   whenNotMatched: { insert: true },
 * };
 * ```
 */
export interface MergeOptions<T> {
  /** Source rows (plain objects) or a subquery. */
  readonly source: readonly Readonly<Record<string, unknown>>[] | Subquery;
  /** Alias of the source relation.
   * @defaultValue 'source' */
  readonly as?: string;
  /** Join condition between target (model alias) and source (`col('source.attr')`). */
  readonly on: WhereOptions<T> | unknown;
  /** Actions for matched rows, applied in order. */
  readonly whenMatched?: MergeMatchedAction<T> | readonly MergeMatchedAction<T>[];
  /** Actions for source rows without a target row. */
  readonly whenNotMatched?: MergeInsertAction<T> | readonly MergeInsertAction<T>[];
  /** Actions for target rows without a source row (PostgreSQL 17+). */
  readonly whenNotMatchedBySource?: MergeMatchedAction<T> | readonly MergeMatchedAction<T>[];
}
