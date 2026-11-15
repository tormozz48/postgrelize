import type { IncludeOption } from '../associations/include.ts';
import type { JoinSources } from './join-source-builder.ts';
import type { OnConflictOptions } from './on-conflict-builder.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { WhereOptions } from './types.ts';
import type { SaveOptions } from './write-options.ts';

/** Options of `bulkCreate`. */
export type BulkCreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** `ON CONFLICT DO NOTHING`. */
    ignoreDuplicates?: boolean;
    /** Run per-instance `create` hooks (rows are then inserted one by one, like v6). */
    individualHooks?: boolean;
    /** Create associated rows from nested values (rows are inserted one by one). */
    include?: IncludeOption;
    /** Attributes updated from the proposed row on conflict (`DO UPDATE SET a = EXCLUDED.a`). */
    updateOnDuplicate?: readonly (keyof T & string)[];
    /** Conflict target attributes for `updateOnDuplicate`. Default: first unique key, else primary key. */
    conflictAttributes?: readonly (keyof T & string)[];
    /** Predicate of a partial unique index used as conflict target. */
    conflictWhere?: WhereOptions<T>;
    /** Advanced `ON CONFLICT` handling; cannot be combined with the options above. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options shared by bulk `update`, `destroy` and `restore`. */
export type BulkHookOptions = Readonly<{
  /** Run bulk hooks. Default true. */
  hooks?: boolean;
  /** Also run per-instance hooks (rows are loaded first). */
  individualHooks?: boolean;
}>;

/** Options of static `update`. */
export type UpdateOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to update. */
    where: WhereOptions<T>;
    /** Attributes to update; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Do not update `updatedAt`. */
    silent?: boolean;
    /** Return updated rows as the second element of the result. */
    returning?: boolean;
    /** With `returning`: expose values before the update as `instance.oldValues`. PostgreSQL 18+. */
    returningOld?: boolean;
    /** Validate the new values. Default true. */
    validate?: boolean;
    /** For paranoid models: `false` also updates soft-deleted rows. */
    paranoid?: boolean;
    /** Extra relations (`UPDATE ... FROM`), keyed by alias; reference them with `col('alias.attr')`. PostgreSQL extension. */
    from?: JoinSources;
  }> &
  BulkHookOptions;

/** Options of static `destroy`. */
export type DestroyOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to delete. */
    where?: WhereOptions<T>;
    /** Delete at most this many rows. */
    limit?: number;
    /** Use `TRUNCATE` instead of `DELETE`. */
    truncate?: boolean;
    /** With `truncate`: `CASCADE`. */
    cascade?: boolean;
    /** With `truncate`: `RESTART IDENTITY`. */
    restartIdentity?: boolean;
    /** Return deleted rows instead of their count (`DELETE ... RETURNING`). PostgreSQL extension. */
    returning?: boolean;
    /** For paranoid models: delete rows instead of setting `deletedAt`. */
    force?: boolean;
    /** Extra relations (`DELETE ... USING`), keyed by alias. PostgreSQL extension. */
    using?: JoinSources;
  }> &
  BulkHookOptions;

/** Options of static `restore`. */
export type RestoreOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to restore. */
    where?: WhereOptions<T>;
  }> &
  BulkHookOptions;

/** Options of instance `destroy`. */
export type InstanceDestroyOptions = QueryOptionsBase &
  Readonly<{
    /** For paranoid models: delete the row instead of setting `deletedAt`. */
    force?: boolean;
    /** Run `beforeDestroy` / `afterDestroy` hooks. Default true. */
    hooks?: boolean;
  }>;
