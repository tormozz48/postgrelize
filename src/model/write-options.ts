import type { IncludeOption } from '../associations/include.ts';
import type { OnConflictOptions } from './on-conflict-builder.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { WhereOptions } from './types.ts';

/** Options of `create` and `save`. */
export type SaveOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to save; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Do not update `updatedAt`. */
    silent?: boolean;
    /** Return all columns after insert/update (always enabled for PostgreSQL). */
    returning?: boolean;
    /** Run lifecycle hooks. Default true. */
    hooks?: boolean;
    /** Run validations. Default true (false for `bulkCreate`). */
    validate?: boolean;
    /** `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns. PostgreSQL extension. */
    overriding?: 'system' | 'user';
  }>;

/** Options of `create`. */
export type CreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Advanced `ON CONFLICT` handling. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
    /** Create associated rows from nested values (Sequelize v6). */
    include?: IncludeOption;
  }>;

/** Options of `upsert`. */
export type UpsertOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Conflict target columns. Default: unique key of an updated attribute, else primary key. */
    conflictFields?: readonly string[];
    /** Advanced `ON CONFLICT` handling; the result becomes `[instance, created]`. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
    /** `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns. */
    overriding?: 'system' | 'user';
  }>;

/** Options of `Model.insert`. PostgreSQL extension. */
export type InsertOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to insert; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
    /** Run `beforeBulkCreate` / `afterBulkCreate` hooks. Default true. */
    hooks?: boolean;
    /** Validate rows before inserting. Default false. */
    validate?: boolean;
    /** `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns. */
    overriding?: 'system' | 'user';
    /** Return the pre-statement row values as `instance.oldValues`. PostgreSQL 18+. */
    returningOld?: boolean;
  }>;

/** Options of `Model.insertFrom`. PostgreSQL extension. */
export type InsertFromOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Target attributes, in the order of the subquery columns. */
    columns: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
    /** Return the pre-statement row values as `instance.oldValues`. PostgreSQL 18+. */
    returningOld?: boolean;
  }>;

/** Options of `increment` / `decrement`. */
export type IncrementOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to change (static form). */
    where?: WhereOptions<T>;
    /** Amount, default 1. */
    by?: number;
    /** Do not update `updatedAt`. */
    silent?: boolean;
  }>;

/** Attribute name(s) or a map of attribute name to amount for `increment` / `decrement`. */
export type AttributeAmounts<T> =
  | (keyof T & string)
  | readonly (keyof T & string)[]
  | Partial<Record<keyof T & string, number>>;
