import { StatementBuilder } from './statement-builder.ts';
import {
  attributeColumns,
  deleteQueries,
  insertQueries,
  modelValues,
  registry,
  updateQueries,
} from './model-services.ts';

// Statement builder of data-modifying CTEs wired to the shared services (internal wiring of `Model`).
export const statements = new StatementBuilder({
  registry,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  deletes: deleteQueries,
  inserts: insertQueries,
});
