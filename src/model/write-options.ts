import type { IncludeOption } from '../associations/include.ts';
import type { OnConflictOptions } from './on-conflict-builder.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { WhereOptions } from './types.ts';

/**
 * Options of `create` and instance `save`.
 *
 * Runs `beforeSave` / `beforeCreate` / `beforeUpdate` hooks (and their `after` counterparts) unless `hooks` is `false`.
 *
 * @see {@link Model.create}
 *
 * @example
 * ```ts
 * const opts: SaveOptions<User> = { fields: ['name', 'email'], validate: true, transaction };
 * await user.save(opts);
 * ```
 */
// oxlint-disable-next-line typescript/no-explicit-any -- v6 declares `SaveOptions<TModelAttributes = any>`.
export type SaveOptions<T = any> = QueryOptionsBase & {
  /** Attributes to save; others are ignored. Default: all changed attributes. Mutable so hooks can adjust it, as in v6. */
  // oxlint-disable-next-line typescript/no-explicit-any -- an `any` model accepts any field name, like v6
  fields?: readonly (0 extends 1 & T ? any : keyof T & string)[];
} & Readonly<{
    /** Do not update `updatedAt`.
     * @defaultValue false */
    silent?: boolean;
    /** Return all columns after insert/update; PostgreSQL always uses `RETURNING`, so this is accepted for v6 compatibility.
     * @defaultValue true */
    returning?: boolean;
    /** Run lifecycle hooks.
     * @defaultValue true */
    hooks?: boolean;
    /** Run validations.
     * @defaultValue true (`false` for `bulkCreate`) */
    validate?: boolean;
    /**
     * `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns. PostgreSQL extension.
     * @postgrelize
     */
    overriding?: 'system' | 'user';
  }>;

/**
 * Options of `create`.
 *
 * Extends {@link SaveOptions}.
 *
 * @see {@link Model.create}
 *
 * @example
 * ```ts
 * const post = await Post.create(
 *   { title: 'Hello', author: { name: 'Ann' } },
 *   { include: [{ association: 'author' }], transaction },
 * );
 * ```
 */
export type CreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /**
     * Advanced `ON CONFLICT` handling. PostgreSQL extension.
     * @postgrelize
     */
    onConflict?: OnConflictOptions<T>;
    /** Create associated rows from nested values (Sequelize v6). */
    include?: IncludeOption;
  }>;

/**
 * Options of `upsert`.
 *
 * Extends {@link SaveOptions}. With `onConflict` the result of `upsert` becomes `[instance, created]`.
 *
 * @see {@link Model.upsert}
 *
 * @example
 * ```ts
 * const [user] = await User.upsert(
 *   { email: 'a@example.com', name: 'Ann' },
 *   { conflictFields: ['email'] },
 * );
 * ```
 */
export type UpsertOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Conflict target columns. Default: unique key containing a given attribute, else the primary key. */
    conflictFields?: readonly string[];
    /**
     * Advanced `ON CONFLICT` handling; the result becomes `[instance, created]`. PostgreSQL extension.
     * @postgrelize
     */
    onConflict?: OnConflictOptions<T>;
    /**
     * `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns.
     * @postgrelize
     */
    overriding?: 'system' | 'user';
  }>;

/**
 * Options of `Model.insert`. PostgreSQL extension.
 *
 * Rows are inserted with a single `INSERT` and no per-row save hooks; only the bulk-create hooks run.
 *
 * @postgrelize
 * @see {@link Model.insert}
 *
 * @example
 * ```ts
 * const opts: InsertOptions<User> = {
 *   onConflict: { target: ['email'], action: 'nothing' },
 *   hooks: false,
 * };
 * const rows = await User.insert([{ email: 'a@example.com' }], opts);
 * ```
 */
export type InsertOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to insert; others are ignored. Default: all given attributes. */
    fields?: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
    /** Run `beforeBulkCreate` / `afterBulkCreate` hooks.
     * @defaultValue true */
    hooks?: boolean;
    /** Validate rows before inserting.
     * @defaultValue false */
    validate?: boolean;
    /** `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns. */
    overriding?: 'system' | 'user';
    /**
     * Return the pre-statement row values as `instance.oldValues`. PostgreSQL extension, needs PostgreSQL 18+.
     * @postgrelize
     */
    returningOld?: boolean;
  }>;

/**
 * Options of `Model.insertFrom`, which inserts the result of a subquery (`INSERT ... SELECT`). PostgreSQL extension.
 *
 * @postgrelize
 * @see {@link Model.insertFrom}
 *
 * @example
 * ```ts
 * const opts: InsertFromOptions<Task> = {
 *   columns: ['title', 'projectId'],
 *   onConflict: { action: 'nothing' },
 * };
 * ```
 */
export type InsertFromOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Target attributes, in the order of the subquery columns. */
    columns: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
    /** Return the pre-statement row values as `instance.oldValues`. PostgreSQL 18+. */
    returningOld?: boolean;
  }>;

/**
 * Options of `increment` and `decrement`.
 *
 * Runs one `UPDATE ... SET col = col + n` and updates `updatedAt` unless `silent`.
 *
 * @see {@link Model.increment}
 *
 * @example
 * ```ts
 * await Product.increment('stock', { by: 5, where: { id: 1 } });
 * const opts: IncrementOptions<Product> = { by: 2, silent: true, transaction };
 * const product = await Product.findByPk(1);
 * await product!.decrement('stock', opts);
 * ```
 */
export type IncrementOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to change; required for the static form, ignored on instances. */
    where?: WhereOptions<T>;
    /** Amount to add (`increment`) or subtract (`decrement`).
     * @defaultValue 1 */
    by?: number;
    /** Do not update `updatedAt`.
     * @defaultValue false */
    silent?: boolean;
  }>;

/** Attribute name(s) or a map of attribute name to amount for `increment` / `decrement`. */
export type AttributeAmounts<T> =
  | (keyof T & string)
  | readonly (keyof T & string)[]
  | Partial<Record<keyof T & string, number>>;

/**
 * Options of the instance updates that association accessors run (Sequelize v6 `InstanceUpdateOptions`): the {@link SaveOptions}.
 *
 * @example
 * ```ts
 * const options: InstanceUpdateOptions<User> = { fields: ['name'], transaction };
 * await user.update({ name: 'Ann' }, options);
 * ```
 */
export type InstanceUpdateOptions<T = Values> = SaveOptions<T>;
