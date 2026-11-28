import type { WithOption } from './cte-builder.ts';
import type { JoinSources } from './join-source-builder.ts';
import type { Order } from './select-options.ts';
import type { JoinsOption } from './source-options.ts';
import type { SqlValue, WhereOptions } from './where-options.ts';

/**
 * A SELECT over sources instead of a model, for {@link Sequelize.select} and
 * {@link Sequelize.subquery}. Column names are written as in the database, usually
 * `'alias.column'`. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: SourceQueryOptions = {
 *   from: { ids: { function: 'unnest', args: [cast([1, 2], 'integer[]')], columns: ['id'] } },
 *   attributes: ['ids.id'],
 *   order: [[col('ids.id'), 'ASC']],
 * };
 * ```
 */
export type SourceQueryOptions = Readonly<{
  /** Sources by alias: the first is the main source, the others are comma-joined. */
  from: JoinSources;
  /** Joined sources; see {@link JoinOptions}. */
  joins?: JoinsOption;
  /**
   * Selected columns: `'alias.column'`, `'alias.*'`, expressions or `[column or expression, name]`.
   * @defaultValue every column
   */
  attributes?: readonly (string | SqlValue | readonly [string | SqlValue, string])[];
  /** Condition. A column of a source is a `'$alias.column$'` key or `where(col('alias.column'), …)`; a bare `'a.b'` key is a JSON path, as in finders. */
  where?: WhereOptions;
  /** `GROUP BY` columns or expressions. */
  group?: string | SqlValue | readonly (string | SqlValue)[];
  /** `HAVING` condition. */
  having?: WhereOptions;
  /** `ORDER BY`, as in finders. */
  order?: Order;
  /** Maximum number of rows. */
  limit?: number | null;
  /** Rows skipped. */
  offset?: number | null;
  /**
   * `SELECT DISTINCT`.
   * @defaultValue false
   */
  distinct?: boolean;
  /** Common table expressions (`WITH`). */
  with?: WithOption;
}>;
