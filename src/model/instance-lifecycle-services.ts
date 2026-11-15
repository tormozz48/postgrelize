import type { IncludeResolver } from '../associations/include-resolver.ts';
import type { NestedCreator } from '../associations/nested-creator.ts';
import type { SqlCompiler } from '../sql/compile.ts';
import type { InstanceValidator } from '../validation/instance-validator.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { DeleteQueryBuilder } from './delete-query-builder.ts';
import type { InsertQueryBuilder } from './insert-query-builder.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { ModelValues } from './model-values.ts';
import type { RowMapper } from './row-mapper.ts';
import type { SelectQueryBuilder } from './select-query-builder.ts';
import type { UpdateQueryBuilder } from './update-query-builder.ts';

/** Options of `instance.validate()`. */
export type ValidateOptions = Readonly<{
  /** Run `beforeValidate` / `afterValidate` / `validationFailed` hooks. Default true. */
  hooks?: boolean;
  /** Attributes to skip. */
  skip?: readonly string[];
  /** Only validate these attributes. */
  fields?: readonly string[];
}>;

/** Collaborators of {@link InstanceLifecycle}. */
export type InstanceLifecycleServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Value rules. */
  values: ModelValues;
  /** Row parsing. */
  rows: RowMapper;
  /** Shared column helpers. */
  columns: AttributeColumns;
  /** SELECT builder (`reload`). */
  selects: SelectQueryBuilder;
  /** INSERT builder (`save` of new instances). */
  inserts: InsertQueryBuilder;
  /** UPDATE builder (`save` of loaded instances). */
  updates: UpdateQueryBuilder;
  /** DELETE builder (`destroy`). */
  deletes: DeleteQueryBuilder;
  /** Include tree of nested builds. */
  includes: IncludeResolver;
  /** Nested creation. */
  nested: NestedCreator;
  /** Attribute / model validators. */
  validator: InstanceValidator;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;
