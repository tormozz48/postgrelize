import { CopyEncoder } from '../connection/copy.ts';
import { SqlLiteral } from '../ddl/sql-literal.ts';
import { MergeQueryBuilder } from './merge-query-builder.ts';
import {
  attributeColumns,
  cteBuilder,
  deleteQueries,
  findQueries,
  includeLoader,
  includeQueries,
  includeResolver,
  nestedBulkCreator,
  insertQueries,
  joinSources,
  lifecycle,
  modelValues,
  onConflictBuilder,
  registry,
  returningOld,
  rowMapper,
  selectQueries,
  sqlCompiler,
  updateQueries,
  writtenRows,
} from './model-services.ts';
import { BulkCreateOperation } from './operations/bulk-create-operation.ts';
import { CopyOperation } from './operations/copy-operation.ts';
import { CountOperation } from './operations/count-operation.ts';
import { CreateOperation } from './operations/create-operation.ts';
import { DestroyOperation } from './operations/destroy-operation.ts';
import { FindOperation } from './operations/find-operation.ts';
import { IncrementOperation } from './operations/increment-operation.ts';
import { InsertOperation } from './operations/insert-operation.ts';
import { BulkInsertBuilder } from './bulk-insert-builder.ts';
import { UnnestInsertBuilder } from './unnest-insert-builder.ts';
import { MergeOperation } from './operations/merge-operation.ts';
import { UpdateOperation } from './operations/update-operation.ts';
import { UpsertOperation } from './operations/upsert-operation.ts';

// Model operations wired to the shared services (internal wiring of `Model`).

export const finder = new FindOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  selects: selectQueries,
  finds: findQueries,
  rows: rowMapper,
  includes: includeResolver,
  loader: includeLoader,
  compiler: sqlCompiler,
});
export const counter = new CountOperation({
  registry,
  lifecycle,
  columns: attributeColumns,
  selects: selectQueries,
  cte: cteBuilder,
  rows: rowMapper,
  includes: includeResolver,
  includeQueries,
  compiler: sqlCompiler,
});
export const inserter = new InsertOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  inserts: insertQueries,
  conflicts: onConflictBuilder,
  returningOld,
  written: writtenRows,
  compiler: sqlCompiler,
});
export const creator = new CreateOperation({
  registry,
  lifecycle,
  values: modelValues,
  conflicts: onConflictBuilder,
  inserter,
});
export const bulkCreator = new BulkCreateOperation({
  registry,
  lifecycle,
  values: modelValues,
  bulkInserts: new BulkInsertBuilder(
    insertQueries,
    new UnnestInsertBuilder(insertQueries, sqlCompiler),
    onConflictBuilder,
    sqlCompiler,
  ),
  conflicts: onConflictBuilder,
  inserter,
  written: writtenRows,
  includes: includeResolver,
  nested: nestedBulkCreator,
});
export const upserter = new UpsertOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  inserts: insertQueries,
  conflicts: onConflictBuilder,
  written: writtenRows,
  compiler: sqlCompiler,
});
export const updater = new UpdateOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  joins: joinSources,
  returningOld,
  written: writtenRows,
  compiler: sqlCompiler,
});
export const destroyer = new DestroyOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  deletes: deleteQueries,
  joins: joinSources,
  rows: rowMapper,
  compiler: sqlCompiler,
});
export const incrementer = new IncrementOperation({
  registry,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  rows: rowMapper,
  compiler: sqlCompiler,
});
export const merger = new MergeOperation({
  registry,
  merges: new MergeQueryBuilder(attributeColumns),
  returningOld,
  written: writtenRows,
  compiler: sqlCompiler,
});
export const copier = new CopyOperation({
  registry,
  columns: attributeColumns,
  finds: findQueries,
  includes: includeResolver,
  encoder: new CopyEncoder(),
  literals: new SqlLiteral(),
  compiler: sqlCompiler,
});
