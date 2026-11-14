import type { DefinitionOptions } from './definition.ts';
import type { Model } from './model.ts';
import type { OnConflictOptions } from './on-conflict.ts';
import type { SelectOptions } from './query-builders.ts';
import type { QueryOptionsBase, RuntimeOwner } from './runtime.ts';
import type { MakeNullishOptional, WhereOptions } from './types.ts';

/** Plain attribute values of a model. */
export type Values = Record<string, unknown>;

/** Any model instance type. */
// oxlint-disable-next-line typescript/no-explicit-any -- Sequelize v6 compat: attribute types are unknown here
export type AnyModel = Model<any, any>;

/** Attribute types of model instance type `M`. */
export type Attributes<M extends AnyModel> = M['_attributes'];

/** Creation attribute types of model instance type `M`. */
export type CreationAttributes<M extends AnyModel> = MakeNullishOptional<M['_creationAttributes']>;

/** A model class whose instances are `M` (Sequelize v6 `ModelStatic`). */
export type ModelStatic<M extends AnyModel> = Omit<typeof Model, 'prototype'> & {
  new (values?: Values, options?: BuildOptions): M;
  /** Instance prototype. */
  prototype: M;
};

/** Result of `findAndCountAll`. */
export type FindAndCountResult<M> = {
  /** Total number of matching rows, ignoring `limit` / `offset`. */
  count: number;
  /** Rows of the current page. */
  rows: M[];
};

/** Schema-qualified table name returned by `getTableName`. */
export type QualifiedTableName = Readonly<{
  /** Table name. */
  tableName: string;
  /** Schema name. */
  schema: string;
  /** Separator between schema and table. */
  delimiter: string;
}>;

/** Options of `Model.init`. */
export type InitOptions = DefinitionOptions &
  Readonly<{
    /** Owning `Sequelize` instance. */
    sequelize: RuntimeOwner;
  }>;

/** Options of `Model.build`. */
export type BuildOptions = Readonly<{
  /** Whether the instance represents a row that does not exist yet. Default true. */
  isNewRecord?: boolean;
  /** Set values without setters and without change tracking. */
  raw?: boolean;
}>;

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
  }>;

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
  }>;

/** Options of `aggregate`, `max`, `min`, `sum`. */
export type AggregateOptions<T = Values> = CountOptions<T> &
  Readonly<{
    /** Return all rows instead of one value. */
    plain?: boolean;
  }>;

/** Options of `create` and `save`. */
export type SaveOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to save; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Do not update `updatedAt`. */
    silent?: boolean;
    /** Return all columns after insert/update (always enabled for PostgreSQL). */
    returning?: boolean;
  }>;

/** Options of `create`. */
export type CreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Advanced `ON CONFLICT` handling. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `bulkCreate`. */
export type BulkCreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** `ON CONFLICT DO NOTHING`. */
    ignoreDuplicates?: boolean;
    /** Attributes updated from the proposed row on conflict (`DO UPDATE SET a = EXCLUDED.a`). */
    updateOnDuplicate?: readonly (keyof T & string)[];
    /** Conflict target attributes for `updateOnDuplicate`. Default: first unique key, else primary key. */
    conflictAttributes?: readonly (keyof T & string)[];
    /** Predicate of a partial unique index used as conflict target. */
    conflictWhere?: WhereOptions<T>;
    /** Advanced `ON CONFLICT` handling; cannot be combined with the options above. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `upsert`. */
export type UpsertOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Conflict target columns. Default: unique key of an updated attribute, else primary key. */
    conflictFields?: readonly string[];
    /** Advanced `ON CONFLICT` handling; the result becomes `[instance, created]`. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `Model.insert`. PostgreSQL extension. */
export type InsertOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to insert; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
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
  }>;

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

/** Options of `findOrCreate` / `findOrBuild`. */
export type FindOrCreateOptions<T = Values> = FindOptions<T> &
  Readonly<{
    /** Values used in addition to `where` when creating. */
    defaults?: Partial<T>;
  }>;

/** Attribute name(s) or a map of attribute name to amount for `increment` / `decrement`. */
export type AttributeAmounts<T> =
  | (keyof T & string)
  | readonly (keyof T & string)[]
  | Partial<Record<keyof T & string, number>>;
