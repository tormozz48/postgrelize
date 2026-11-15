import type { Subquery } from '../expressions/methods.ts';
import type { WhereOptions } from './types.ts';

/** One `WHEN MATCHED` / `WHEN NOT MATCHED BY SOURCE` action of `merge`. */
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

/** `WHEN NOT MATCHED` action of `merge`. */
export interface MergeInsertAction<T> {
  /** Extra condition (`WHEN NOT MATCHED AND ...`); may reference only source columns. */
  readonly where?: unknown;
  /** Values to insert: `true` copies same-named source columns, or a map of values / expressions. */
  readonly insert?: true | Partial<Record<keyof T & string, unknown>>;
  /** Do nothing. */
  readonly nothing?: true;
}

/** Options of `Model.merge`. PostgreSQL 15+ (RETURNING: 17+). */
export interface MergeOptions<T> {
  /** Source rows (plain objects) or a subquery. */
  readonly source: readonly Readonly<Record<string, unknown>>[] | Subquery;
  /** Alias of the source; default `'source'`. */
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
