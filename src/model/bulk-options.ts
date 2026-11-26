import type { IncludeOption } from '../associations/include.ts';
import type { JoinSources } from './join-source-builder.ts';
import type { OnConflictOptions } from './on-conflict-builder.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { WhereOptions } from './types.ts';
import type { SaveOptions } from './write-options.ts';

/**
 * Options of `bulkCreate`.
 *
 * Extends {@link SaveOptions}. Rows are inserted with one `INSERT` unless `individualHooks` is set; nested records of `include` are created by one nested `bulkCreate` per include. Validation is off by default (unlike `create`).
 *
 * @see {@link Model.bulkCreate}
 * @see {@link OnConflictOptions}
 *
 * @example
 * ```ts
 * const rows = [{ email: 'a@example.com', name: 'Ann' }];
 * await User.bulkCreate(rows, {
 *   updateOnDuplicate: ['name'],
 *   conflictAttributes: ['email'],
 *   transaction,
 * });
 * const opts: BulkCreateOptions<User> = { ignoreDuplicates: true };
 * ```
 */
export type BulkCreateOptions<T = Values> = SaveOptions<T> & {
  /**
   * Insert with one array parameter per column (`INSERT … SELECT * FROM unnest($1::type[], …)`) instead of
   * one parameter per cell, so batches are not capped by PostgreSQL's 65535 parameters. Every row must
   * provide every column; `ARRAY` columns and conflict options are not supported. PostgreSQL extension.
   * @defaultValue false
   * @postgrelize
   */
  unnest?: boolean;
  /** Add `ON CONFLICT DO NOTHING`, skipping rows that violate a unique constraint.
   * @defaultValue false */
  ignoreDuplicates?: boolean;
  /** Run per-instance `create` hooks (rows are then inserted one by one, like v6).
   * @defaultValue false */
  individualHooks?: boolean;
  /** Create associated rows from nested values (rows are inserted one by one). */
  include?: IncludeOption;
  /** Attributes updated from the proposed row on conflict (`DO UPDATE SET a = EXCLUDED.a`). */
  updateOnDuplicate?: readonly (keyof T & string)[];
  /** Conflict target attributes for `updateOnDuplicate`. Default: first unique key, else primary key. */
  conflictAttributes?: readonly (keyof T & string)[];
  /** Predicate of a partial unique index used as conflict target. */
  conflictWhere?: WhereOptions<T>;
  /**
   * Advanced `ON CONFLICT` handling; cannot be combined with the options above. PostgreSQL extension.
   * @postgrelize
   */
  onConflict?: OnConflictOptions<T>;
};

/**
 * Hook switches shared by bulk `update`, `destroy` and `restore`.
 *
 * @example
 * ```ts
 * const opts: BulkHookOptions = { hooks: true, individualHooks: true };
 * await User.destroy({ where: { active: false }, ...opts });
 * ```
 */
export type BulkHookOptions = {
  /** Run the bulk hooks (`beforeBulkUpdate`, `beforeBulkDestroy`, ...).
   * @defaultValue true */
  hooks?: boolean;
  /** Also run per-instance hooks; rows are loaded first, which costs an extra query.
   * @defaultValue false */
  individualHooks?: boolean;
};

/**
 * Options of static `update`.
 *
 * Extends {@link BulkHookOptions}. Updates `updatedAt` unless `silent`.
 *
 * @see {@link Model.update}
 *
 * @example
 * ```ts
 * const [count] = await User.update(
 *   { active: false },
 *   { where: { lastLogin: { [Op.lt]: new Date('2020-01-01') } }, transaction },
 * );
 * const opts: UpdateOptions<Task> = { where: { done: false }, returning: true };
 * ```
 */
export type UpdateOptions<T = Values> = QueryOptionsBase & {
  /** Attributes to update; others are ignored. Mutable so hooks can adjust it, as in v6. */
  fields?: readonly (keyof T & string)[];
} & {
  /** Rows to update. */
  where: WhereOptions<T>;
  /** Do not update `updatedAt`.
   * @defaultValue false */
  silent?: boolean;
  /** Return updated rows as the second element of the result. */
  returning?: boolean;
  /**
   * With `returning`: expose values before the update as `instance.oldValues`. PostgreSQL extension, needs PostgreSQL 18+.
   * @postgrelize
   */
  returningOld?: boolean;
  /** Validate the new values.
   * @defaultValue true */
  validate?: boolean;
  /** For paranoid models: `false` also updates soft-deleted rows.
   * @defaultValue true */
  paranoid?: boolean;
  /**
   * Extra relations (`UPDATE ... FROM`), keyed by alias; reference them with `col('alias.attr')`. PostgreSQL extension.
   * @postgrelize
   */
  from?: JoinSources;
} & BulkHookOptions;

/**
 * Options of static `destroy`.
 *
 * Extends {@link BulkHookOptions}. Paranoid models are soft-deleted (`deletedAt` set) unless `force`.
 *
 * @see {@link Model.destroy}
 *
 * @example
 * ```ts
 * await Post.destroy({ where: { draft: true }, force: true });
 * const opts: DestroyOptions<Task> = { truncate: true, cascade: true, restartIdentity: true };
 * ```
 */
export type DestroyOptions<T = Values> = QueryOptionsBase & {
  /** Rows to delete. */
  where?: WhereOptions<T>;
  /** Delete at most this many rows. */
  limit?: number;
  /** Use `TRUNCATE` instead of `DELETE`.
   * @defaultValue false */
  truncate?: boolean;
  /** With `truncate`: add `CASCADE`.
   * @defaultValue false */
  cascade?: boolean;
  /** With `truncate`: add `RESTART IDENTITY`.
   * @defaultValue false */
  restartIdentity?: boolean;
  /**
   * Return deleted rows instead of their count (`DELETE ... RETURNING`). PostgreSQL extension.
   * @postgrelize
   */
  returning?: boolean;
  /** For paranoid models: delete rows instead of setting `deletedAt`.
   * @defaultValue false */
  force?: boolean;
  /**
   * Extra relations (`DELETE ... USING`), keyed by alias. PostgreSQL extension.
   * @postgrelize
   */
  using?: JoinSources;
} & BulkHookOptions;

/**
 * Options of static `restore`, which clears `deletedAt` of soft-deleted rows of paranoid models.
 *
 * @see {@link Model.restore}
 *
 * @example
 * ```ts
 * await Post.restore({ where: { authorId: 1 }, transaction });
 * const opts: RestoreOptions<Post> = { hooks: false };
 * ```
 */
export type RestoreOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to restore; all soft-deleted rows when omitted. */
    where?: WhereOptions<T>;
  }> &
  BulkHookOptions;

/**
 * Options of instance `destroy`.
 *
 * @see {@link Model.destroy}
 *
 * @example
 * ```ts
 * await post.destroy({ force: true, transaction });
 * const opts: InstanceDestroyOptions = { hooks: false };
 * ```
 */
export type InstanceDestroyOptions = QueryOptionsBase & {
  /** For paranoid models: delete the row instead of setting `deletedAt`.
   * @defaultValue false */
  force?: boolean;
  /** Run `beforeDestroy` / `afterDestroy` hooks.
   * @defaultValue true */
  hooks?: boolean;
};
