import type { CteFindOptions } from './cte.ts';
import type { JoinSources } from './write-power.ts';
import type { IncludeOption } from '../associations/include.ts';
import type { HooksOption } from '../hooks/hooks.ts';
import type { StandardSchemaV1 } from '../validation/standard-schema.ts';
import type { ModelValidatorFunction } from '../validation/types.ts';
import type { DefinitionOptions } from './definition.ts';
import type { ScopeDefinition, ScopeOptions, WhereMergeStrategy } from './scopes.ts';
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
    /** Lifecycle hooks. */
    hooks?: HooksOption;
    /** Scope applied to every query unless `unscoped()` / `scope()` is used. */
    defaultScope?: ScopeOptions;
    /** Named scopes: options or functions returning options. */
    scopes?: Readonly<Record<string, ScopeDefinition>>;
    /** How `where` of merged scopes combine: `'overwrite'` same keys (default) or `'and'`. */
    whereMergeStrategy?: WhereMergeStrategy;
    /** Model-level validators; throw to fail. */
    validate?: Readonly<Record<string, ModelValidatorFunction>>;
    /** Standard Schema (zod, valibot, arktype) validating all attribute values. Extension; `schema` keeps its v6 meaning (PostgreSQL schema). */
    validationSchema?: StandardSchemaV1;
  }>;

/** Options of `Model.build`. */
export type BuildOptions = Readonly<{
  /** Whether the instance represents a row that does not exist yet. Default true. */
  isNewRecord?: boolean;
  /** Set values without setters and without change tracking. */
  raw?: boolean;
  /** Build associated instances from nested values (Sequelize v6 nested creation). */
  include?: IncludeOption;
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
    /** Run `beforeBulkCreate` / `afterBulkCreate` hooks. Default true. */
    hooks?: boolean;
    /** Validate rows before inserting. Default false. */
    validate?: boolean;
    /** `OVERRIDING SYSTEM VALUE` / `OVERRIDING USER VALUE` for identity columns. */
    overriding?: 'system' | 'user';
  }>;

/** Options shared by bulk `update`, `destroy` and `restore`. */
export type BulkHookOptions = Readonly<{
  /** Run bulk hooks. Default true. */
  hooks?: boolean;
  /** Also run per-instance hooks (rows are loaded first). */
  individualHooks?: boolean;
}>;

/** Options of `Model.insertFrom`. PostgreSQL extension. */
export type InsertFromOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Target attributes, in the order of the subquery columns. */
    columns: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `Model.copyFrom`. PostgreSQL extension. */
export type CopyFromOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to copy, in row order; default: keys of the first row of an array source. */
    columns?: readonly (keyof T & string)[];
  }>;

/** Output format options of `Model.copyTo`. PostgreSQL extension. */
export type CopyToFormatOptions = Readonly<{
  /** `text` (default), `csv` or `binary`. */
  format?: 'text' | 'csv' | 'binary';
  /** Emit a header line (text / csv). */
  header?: boolean;
  /** Single-character field delimiter. */
  delimiter?: string;
  /** String written for NULL values. */
  nullString?: string;
  /** Single-character quote (csv). */
  quote?: string;
}>;

/** Options of `Model.copyTo`. */
export type CopyToOptions<T = Values> = FindOptions<T> & CopyToFormatOptions;

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
