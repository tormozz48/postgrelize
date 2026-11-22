import type { Subquery } from '../expressions/methods.ts';
import type { AnyModel, ModelStatic } from './options.ts';

/**
 * `TABLESAMPLE` of a table. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const sample: TableSampleOptions = { method: 'BERNOULLI', percent: 10, seed: 42 };
 * const rows = await Post.findAll({ sample });
 * ```
 */
export type TableSampleOptions = Readonly<{
  /** Sampling method: `BERNOULLI` (row by row) or `SYSTEM` (block by block, faster). */
  method: 'BERNOULLI' | 'SYSTEM';
  /** Percentage of the table to read, from 0 to 100. Bound as a parameter. */
  percent: number;
  /** `REPEATABLE` seed: the same seed returns the same sample while the data does not change. */
  seed?: number;
}>;

/**
 * One column of a {@link JsonTableOptions}. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const columns: JsonTableColumnOptions[] = [
 *   { name: 'position', ordinality: true },
 *   { name: 'qty', type: 'integer', path: '$.quantity' },
 *   { name: 'hasNote', exists: true, path: '$.note' },
 * ];
 * ```
 */
export type JsonTableColumnOptions = Readonly<{
  /** Output column name. */
  name: string;
  /** Number the rows (`FOR ORDINALITY`); no `type` or `path`. */
  ordinality?: boolean;
  /** Column type: one of the cast types (`integer`, `text`, `jsonb`, `timestamptz`, …). */
  type?: string;
  /** jsonpath of the value, relative to the row; defaults to the column name. */
  path?: string;
  /** Return whether the path matches (`EXISTS`); `type` defaults to `boolean`. */
  exists?: boolean;
}>;

/**
 * `JSON_TABLE` source: turns a JSON document into rows. PostgreSQL extension. Needs PostgreSQL 17.
 *
 * @example
 * ```ts
 * const source: JsonTableOptions = {
 *   doc: { items: [{ sku: 'a', qty: 2 }] },
 *   path: '$.items[*]',
 *   columns: [{ name: 'sku', type: 'text' }, { name: 'qty', type: 'integer' }],
 * };
 * ```
 */
export type JsonTableOptions = Readonly<{
  /** Document: a JSON value (bound as `jsonb`) or an expression such as `col('Order.data')`. */
  doc: unknown;
  /** jsonpath that selects the rows; rendered as an escaped string literal. */
  path: string;
  /** Output columns. */
  columns: readonly JsonTableColumnOptions[];
}>;

/**
 * Relation of a `from` entry: a model, a subquery, a relation name, or one of the source forms.
 * PostgreSQL extension.
 *
 * @example
 * ```ts
 * const from: FromSourceOption[] = [
 *   Post,
 *   'audit_log',
 *   { values: { columns: ['id', 'label'], rows: [[1, 'a'], [2, 'b']] } },
 *   { function: 'generate_series', args: [cast(1, 'integer'), cast(3, 'integer')], columns: ['n'] },
 *   { lateral: Post.subquery({ limit: 3 }) },
 *   { model: Post, sample: { method: 'SYSTEM', percent: 5 } },
 * ];
 * ```
 */
export type FromSourceOption =
  | ModelStatic<AnyModel>
  | Subquery
  | string
  | Readonly<{
      /** `(VALUES …) AS alias(columns)`: bound rows. */
      values: Readonly<{
        /** Column names. */
        columns: readonly string[];
        /** Rows: one cell per column, bound as parameters. */
        rows: readonly (readonly unknown[])[];
      }>;
    }>
  | Readonly<{
      /** Set-returning function (`generate_series`, `unnest`, …), optionally schema-qualified. */
      function: string;
      /** Arguments, bound as parameters unless expressions. Wrap values in `cast()` when the type is ambiguous. */
      args?: readonly unknown[];
      /** Column aliases. */
      columns?: readonly string[];
      /** `WITH ORDINALITY`: name of the row-number column, appended to `columns`. */
      ordinality?: string;
    }>
  | Readonly<{
      /** `JSON_TABLE(...)`. PostgreSQL 17+. */
      jsonTable: JsonTableOptions;
    }>
  | Readonly<{
      /** `LATERAL (subquery)`: may reference relations to its left. */
      lateral: Subquery;
    }>
  | Readonly<{
      /** Table of the model read with `TABLESAMPLE`. */
      model: ModelStatic<AnyModel>;
      /** Sampling. */
      sample: TableSampleOptions;
    }>;
