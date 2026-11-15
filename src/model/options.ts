import type { IncludeOption } from '../associations/include.ts';
import type { HooksOption } from '../hooks/hooks.ts';
import type { StandardSchemaV1 } from '../validation/standard-schema.ts';
import type { ModelValidatorFunction } from '../validation/types.ts';
import type { DefinitionOptions } from './model-definition.ts';
import type { ScopeDefinition, ScopeOptions, WhereMergeStrategy } from './scope-registry.ts';
import type { Model } from './model.ts';
import type { RuntimeOwner } from './runtime.ts';
import type { MakeNullishOptional } from './types.ts';

export type {
  AggregateOptions,
  CountOptions,
  FindAndCountResult,
  FindOptions,
  FindOrCreateOptions,
} from './find-options.ts';
export type {
  AttributeAmounts,
  CreateOptions,
  IncrementOptions,
  InsertFromOptions,
  InsertOptions,
  SaveOptions,
  UpsertOptions,
} from './write-options.ts';
export type {
  BulkCreateOptions,
  BulkHookOptions,
  DestroyOptions,
  InstanceDestroyOptions,
  RestoreOptions,
  UpdateOptions,
} from './bulk-options.ts';
export type { CopyFromOptions, CopyToFormatOptions, CopyToOptions } from './copy-options.ts';

/** Plain attribute values of a model. */
export type Values = Record<string, unknown>;

/** @internal Options object of an operation, passed to hooks (which may change it). */
export type MutableOptions = Record<string, unknown>;

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
