import { IncludeLoader } from '../associations/include-loader.ts';
import { IncludeQueryBuilder } from '../associations/include-query-builder.ts';
import { IncludeResolver } from '../associations/include-resolver.ts';
import { NestedCreator } from '../associations/nested-creator.ts';
import { NestedBulkCreator } from '../associations/nested-bulk-creator.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { InstanceValidator } from '../validation/instance-validator.ts';
import { AttributeColumns } from './attribute-columns.ts';
import { CteBuilder } from './cte-builder.ts';
import { DeleteQueryBuilder } from './delete-query-builder.ts';
import { FindQueryBuilder } from './find-query-builder.ts';
import { InsertQueryBuilder } from './insert-query-builder.ts';
import { InstanceLifecycle } from './instance-lifecycle.ts';
import { SyncHooks } from './sync-hooks.ts';
import { InstanceState } from './instance-state.ts';
import { InstanceValues } from './instance-values.ts';
import { JoinSourceBuilder } from './join-source-builder.ts';
import { ModelRegistry } from './model-registry.ts';
import { ModelValues } from './model-values.ts';
import { OnConflictBuilder } from './on-conflict-builder.ts';
import type { AnyModel } from './options.ts';
import { ReturningOld } from './returning-old.ts';
import { RowMapper } from './row-mapper.ts';
import { SelectQueryBuilder } from './select-query-builder.ts';
import { UpdateQueryBuilder } from './update-query-builder.ts';
import { ValueCloner } from './value-cloner.ts';
import { WrittenRows } from './written-rows.ts';

// Shared, stateless services of all models (internal wiring of `Model`).

// Every model instance has an internal state; plain value objects never do.
const isInstance = (value: unknown): value is AnyModel => InstanceState.has(value);

export const registry = new ModelRegistry();
export const attributeColumns = new AttributeColumns();
export const modelValues = new ModelValues();
export const valueCloner = new ValueCloner();
export const rowMapper = new RowMapper(registry);
export const sqlCompiler = new SqlCompiler();
export const selectQueries = new SelectQueryBuilder(attributeColumns);
export const insertQueries = new InsertQueryBuilder(attributeColumns);
export const updateQueries = new UpdateQueryBuilder(attributeColumns);
export const deleteQueries = new DeleteQueryBuilder(attributeColumns);
export const joinSources = new JoinSourceBuilder(registry, attributeColumns);
export const cteBuilder = new CteBuilder(joinSources);
export const onConflictBuilder = new OnConflictBuilder(attributeColumns);
export const returningOld = new ReturningOld(attributeColumns, rowMapper);
export const writtenRows = new WrittenRows(registry, rowMapper, returningOld);
export const includeResolver = new IncludeResolver();
export const includeQueries = new IncludeQueryBuilder();
export const includeLoader = new IncludeLoader(includeResolver);
export const nestedCreator = new NestedCreator(includeResolver, isInstance);
export const nestedBulkCreator = new NestedBulkCreator(includeResolver, isInstance);
export const findQueries = new FindQueryBuilder(selectQueries, cteBuilder, includeQueries);
export const instanceValues = new InstanceValues(registry, modelValues, isInstance, (node, value) =>
  nestedCreator.build(node, value),
);
export const lifecycle = new InstanceLifecycle({
  registry,
  values: modelValues,
  rows: rowMapper,
  columns: attributeColumns,
  selects: selectQueries,
  inserts: insertQueries,
  updates: updateQueries,
  deletes: deleteQueries,
  includes: includeResolver,
  nested: nestedCreator,
  validator: new InstanceValidator(),
  compiler: sqlCompiler,
});
export const syncHooks = new SyncHooks(lifecycle);
