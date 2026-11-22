import type { IncludeOption } from '../associations/include.ts';
import type { DataTypeInput } from '../data-types/data-types.ts';
import type { CteFindOptions } from './cte-builder.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { TableSampleOptions } from './source-options.ts';
import type { SelectOptions } from './select-query-builder.ts';
import type { WhereOptions } from './types.ts';

/** Result of `findAndCountAll`: one page of rows plus the total count. */
export type FindAndCountResult<M> = {
  /** Total number of matching rows, ignoring `limit` / `offset`. */
  count: number;
  /** Rows of the current page. */
  rows: M[];
};

/**
 * Options of the finders (`findAll`, `findOne`, `findByPk`, ...), without association loading details.
 *
 * Extends the query options (`transaction`, `logging`, ...) and the SELECT options with finder flags and the PostgreSQL CTE extension. `include` is typed through {@link IncludeOption}.
 * A `beforeFind` hook may change these options before the query runs.
 *
 * @see {@link Model.findAll}
 * @see {@link WhereOptions}
 *
 * @example
 * ```ts
 * const opts: FindOptions<User> = {
 *   where: { active: true, age: { [Op.gte]: 18 } },
 *   attributes: ['id', 'name'],
 *   order: [['name', 'ASC']],
 *   limit: 10,
 *   include: [Post],
 * };
 * const rows = await User.findAll(opts);
 * ```
 */
export type FindOptions<T = Values> = QueryOptionsBase &
  Omit<SelectOptions, 'where'> &
  Readonly<{
    /** Filter rows; see {@link WhereOptions}. All rows when omitted. */
    where?: WhereOptions<T>;
    /** Return plain row objects instead of model instances.
     * @defaultValue false */
    raw?: boolean;
    /** With `raw`, build nested objects from dotted keys such as `'posts.title'`.
     * @defaultValue false */
    nest?: boolean;
    /** Return a single row instead of an array (set internally by `findOne`).
     * @defaultValue false */
    plain?: boolean;
    /** Throw `EmptyResultError` (or the given `Error`) when no row is found.
     * @defaultValue false */
    rejectOnEmpty?: boolean | Error;
    /** For paranoid models: `false` includes soft-deleted rows.
     * @defaultValue true */
    paranoid?: boolean;
    /** Run `beforeFind` / `afterFind` hooks.
     * @defaultValue true */
    hooks?: boolean;
    /** Eager-load associations through JOINs (or separate queries for `separate` includes). */
    include?: IncludeOption;
    /** `false` disables the sub-query used for `limit` combined with multi-row includes. */
    subQuery?: boolean;
  }> &
  CteFindOptions;

/**
 * Options of `findAndCountAll` (Sequelize v6 `FindAndCountOptions`): the finder options plus the
 * count options `distinct` and `col`. The count query reuses `where`, `include`, `paranoid`,
 * `distinct`, `col`, `replacements`, `transaction` and `logging`; `group` of v6 is not forwarded to it.
 *
 * @see {@link Model.findAndCountAll}
 *
 * @example
 * ```ts
 * const options: FindAndCountOptions<User> = { where: { active: true }, limit: 10, offset: 20 };
 * const { count, rows } = await User.findAndCountAll(options);
 * ```
 */
export type FindAndCountOptions<T = Values> = FindOptions<T> &
  Readonly<{
    /** Count with `count(DISTINCT ...)`.
     * @defaultValue false */
    distinct?: boolean;
    /** Column to count. Default: `*` (the primary key with `distinct`). */
    col?: string;
  }>;

/**
 * Options of `count`.
 *
 * Includes joins and CTE options; `count` fires `beforeCount` hooks.
 *
 * @see {@link Model.count}
 *
 * @example
 * ```ts
 * const total = await Post.count({ where: { published: true }, distinct: true, col: 'authorId' });
 * const opts: CountOptions<Post> = { group: 'authorId' };
 * const perAuthor = await Post.count(opts); // [{ authorId, count }, ...]
 * ```
 */
export type CountOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Filter rows; see {@link WhereOptions}. */
    where?: WhereOptions<T>;
    /** Column to count. Default: `*` (primary key with `distinct`). */
    col?: string;
    /** Use `count(DISTINCT ...)`.
     * @defaultValue false */
    distinct?: boolean;
    /** Group by attributes; the result becomes an array of `{ count, ...groups }`. */
    group?: string | readonly string[];
    /** For paranoid models: `false` includes soft-deleted rows.
     * @defaultValue true */
    paranoid?: boolean;
    /** Run `beforeCount` hooks.
     * @defaultValue true */
    hooks?: boolean;
    /** Join associations (rows are counted per joined row unless `distinct`). */
    include?: IncludeOption;
    /** Count only a random sample of the table (`TABLESAMPLE`). PostgreSQL extension. */
    sample?: TableSampleOptions;
  }> &
  CteFindOptions;

/**
 * Options of `aggregate`, `max`, `min` and `sum`.
 *
 * Same as {@link CountOptions} plus `plain`.
 *
 * @see {@link Model.aggregate}
 *
 * @example
 * ```ts
 * const opts: AggregateOptions<Product> = { where: { active: true }, paranoid: false };
 * const highest = await Product.max('price', opts);
 * ```
 */
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

/**
 * Options of `findOrCreate` and `findOrBuild`.
 *
 * Extends {@link FindOptions}; the `where` values are also used when creating the row.
 *
 * @see {@link Model.findOrCreate}
 *
 * @example
 * ```ts
 * const [user, created] = await User.findOrCreate({
 *   where: { email: 'a@example.com' },
 *   defaults: { name: 'Ann' },
 * });
 * ```
 */
export type FindOrCreateOptions<T = Values> = FindOptions<T> &
  Readonly<{
    /** Values used in addition to the plain equality values of `where` when the row is created. */
    defaults?: Partial<T>;
  }>;
