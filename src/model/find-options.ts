import type { IncludeOption } from '../associations/include.ts';
import type { DataTypeInput } from '../data-types/data-types.ts';
import type { CteFindOptions } from './cte-builder.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { SelectOptions } from './select-query-builder.ts';
import type { WhereOptions } from './types.ts';

/** Result of `findAndCountAll`. */
export type FindAndCountResult<M> = {
  /** Total number of matching rows, ignoring `limit` / `offset`. */
  count: number;
  /** Rows of the current page. */
  rows: M[];
};

/** Options of finders (Sequelize v6 `FindOptions`, without `include`). */
export type FindOptions<T = Values> = QueryOptionsBase &
  Omit<SelectOptions, 'where'> &
  Readonly<{
    /** Filter. */
    where?: WhereOptions<T>;
    /** Return plain objects instead of instances. */
    raw?: boolean;
    /** With `raw`, build nested objects from dotted keys. */
    nest?: boolean;
    /** Return a single row (used by `findOne`). */
    plain?: boolean;
    /** Throw `EmptyResultError` (or the given error) when no row is found. */
    rejectOnEmpty?: boolean | Error;
    /** For paranoid models: `false` includes soft-deleted rows. */
    paranoid?: boolean;
    /** Run `beforeFind` / `afterFind` hooks. Default true. */
    hooks?: boolean;
    /** Eager-load associations. */
    include?: IncludeOption;
    /** `false` disables the sub-query used for `limit` with multi includes. */
    subQuery?: boolean;
  }> &
  CteFindOptions;

/** Options of `count`. */
export type CountOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Filter. */
    where?: WhereOptions<T>;
    /** Column to count. */
    col?: string;
    /** `count(DISTINCT ...)`. */
    distinct?: boolean;
    /** Group by attributes; the result becomes an array of `{ count, ...groups }`. */
    group?: string | readonly string[];
    /** For paranoid models: `false` includes soft-deleted rows. */
    paranoid?: boolean;
    /** Run `beforeCount` hooks. Default true. */
    hooks?: boolean;
    /** Join associations (rows are counted per joined row unless `distinct`). */
    include?: IncludeOption;
  }> &
  CteFindOptions;

/** Options of `aggregate`, `max`, `min`, `sum`. */
export type AggregateOptions<T = Values> = CountOptions<T> &
  Readonly<{
    /**
     * Return all rows exactly as the driver delivers them (numeric results such as `sum` are
     * strings, like in Sequelize v6) instead of one converted value.
     *
     * @defaultValue `true`
     */
    plain?: boolean;
    /**
     * Data type that the single result is converted to: `INTEGER` / `BIGINT` give a number,
     * `FLOAT` / `DECIMAL` a float, `DATE` a `Date`. Defaults to the type of the aggregated
     * attribute, or `FLOAT` for `'*'`. Ignored with `plain: false`.
     */
    dataType?: DataTypeInput;
  }>;

/** Options of `findOrCreate` / `findOrBuild`. */
export type FindOrCreateOptions<T = Values> = FindOptions<T> &
  Readonly<{
    /** Values used in addition to `where` when creating. */
    defaults?: Partial<T>;
  }>;
