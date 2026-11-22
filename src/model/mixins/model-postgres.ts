import type { Subquery, WriteStatement } from '../../expressions/methods.ts';
import type { MergeOptions } from '../merge-query-builder.ts';
import { copier, finder, inserter, merger } from '../model-operations.ts';
import { statements } from '../statement-services.ts';
import type { UpdateStatementOptions, WriteStatementOptions } from '../statement-builder.ts';
import type { MergeCallOptions, MergeResult } from '../operations/merge-operation.ts';
import type {
  AnyModel,
  Attributes,
  CopyFromOptions,
  CopyToOptions,
  CreationAttributes,
  FindOptions,
  InsertFromOptions,
  InsertOptions,
  ModelStatic,
  Values,
} from '../options.ts';
import type { QueryOptionsBase } from '../runtime.ts';
import type { UpdateValues } from '../types.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * PostgreSQL extension statics of `Model`: `insert`, `insertFrom`, `merge`, `subquery`, `updateStatement`, `deleteStatement`, `insertStatement`, `findEach`, `copyFrom`, `copyTo`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelPostgres = <TBase extends ModelConstructor>(Base: TBase) => {
  return class PostgresCapability extends Base {
    /**
     * Inserts rows with `INSERT ... ON CONFLICT` and returns the inserted or updated rows. Unlike
     * `bulkCreate`, rows skipped by `DO NOTHING` or by the `DO UPDATE ... WHERE` condition are not
     * returned. Each instance has `wasInserted`. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param values - Attribute values of one row or several rows.
     * @param options - Insert options (`onConflict`, `fields`, `hooks`, `validate`, `overriding`, `returningOld`, query options).
     * @returns Instances of the rows written by the statement.
     * @see {@link Model.bulkCreate} for the Sequelize v6 variant.
     * @see [Bulk writes guide](/guide/bulk-writes)
     * @example
     * ```ts
     * const items = [{ sku: 'a-1', qty: 5 }];
     * const rows = await Product.insert(items, {
     *   onConflict: { target: ['sku'], action: { update: { qty: literal('"Product"."qty" + EXCLUDED."qty"') } } },
     * });
     * const inserted = rows.filter((row) => row.wasInserted);
     * ```
     */
    static insert<M extends AnyModel>(
      this: ModelStatic<M>,
      values: CreationAttributes<M> | readonly CreationAttributes<M>[],
      options: InsertOptions<Attributes<M>> = {},
    ): Promise<M[]> {
      return inserter.insert(this, values as Values | readonly Values[], options as InsertOptions);
    }

    /**
     * `INSERT INTO ... SELECT`: inserts the rows produced by a subquery. Returns the inserted (or, with
     * `onConflict`, updated) rows with `wasInserted`. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The target model class.
     * @param source - Subquery from `Model.subquery()`; its columns must match `options.columns`.
     * @param options - Target columns, `onConflict` and query options.
     * @returns Written rows.
     * @example
     * ```ts
     * await Task.insertFrom(
     *   Post.subquery({ attributes: ['id', 'title'], where: { published: false } }),
     *   { columns: ['postId', 'title'] },
     * );
     * ```
     */
    static insertFrom<M extends AnyModel>(
      this: ModelStatic<M>,
      source: Subquery,
      options: InsertFromOptions<Attributes<M>>,
    ): Promise<M[]> {
      return inserter.insertFrom(this, source, options as InsertFromOptions);
    }

    /**
     * `MERGE INTO ... USING ...` (PostgreSQL 15+). With `returning: true` (PostgreSQL 17+) returns the
     * written rows with the action taken. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param options - Source, join condition and WHEN clauses.
     * @returns Affected row count and, with `returning`, `{ action, instance }` per row.
     * @throws DatabaseError when the server rejects the statement (for example on PostgreSQL older than 15).
     * @example
     * ```ts
     * await Product.merge({
     *   source: [{ sku: 'a', qty: 5 }],
     *   on: { sku: col('source.sku') },
     *   whenMatched: { update: { qty: literal('"Product"."qty" + "source"."qty"') } },
     *   whenNotMatched: { insert: true },
     * });
     * ```
     */
    static merge<M extends AnyModel>(
      this: ModelStatic<M>,
      options: MergeOptions<Attributes<M>> &
        QueryOptionsBase &
        Readonly<{
          /** Return written rows (PostgreSQL 17+). */
          returning?: boolean;
          /** With `returning`: expose pre-statement values as `instance.oldValues` (PostgreSQL 18+). */
          returningOld?: boolean;
        }>,
    ): Promise<MergeResult<M>> {
      return merger.merge(this, options as MergeCallOptions);
    }

    /**
     * Builds a SELECT that can be embedded in another query: in `where` (`[Op.in]`, `=`, `exists()`),
     * in `attributes` (scalar subquery) and as a source of `insertFrom` / `merge`. Default scope and
     * paranoid filter apply; values stay bound parameters of the outer statement. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class the subquery selects from.
     * @param options - Find options (`attributes`, `where`, `order`, `limit`, `include`, ...) and `as` (table alias).
     * @returns Subquery expression.
     * @example
     * ```ts
     * await User.findAll({ where: { id: { [Op.in]: Post.subquery({ attributes: ['userId'], where: { published: true } }) } } });
     * ```
     */
    static subquery<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> & Readonly<{ as?: string }> = {},
    ): Subquery {
      return finder.subquery(this, options as FindOptions & Readonly<{ as?: string }>);
    }

    /**
     * Builds an `UPDATE` for a data-modifying CTE (`with`); nothing runs until the outer query does.
     * No hooks or validation run; `updatedAt` is set unless `silent`. With `returning: true` the CTE
     * can be read through `source`. Queries with such a CTE always use the writer. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param values - New attribute values.
     * @param options - `where`, `returning`, `silent`.
     * @returns Statement for the `with` option.
     * @example
     * ```ts
     * const bumped = Task.updateStatement({ done: true }, { where: { id: 1 }, returning: true });
     * const rows = await Task.findAll({ with: { bumped }, source: 'bumped' });
     * ```
     */
    static updateStatement<M extends AnyModel>(
      this: ModelStatic<M>,
      values: UpdateValues<Attributes<M>>,
      options: UpdateStatementOptions<Attributes<M>> = {},
    ): WriteStatement {
      return statements.update(this, values as Values, options as UpdateStatementOptions);
    }

    /**
     * Builds a `DELETE` for a data-modifying CTE (`with`). It is a real delete, also for paranoid
     * models, and ignores the paranoid filter. With `returning: true` the deleted rows can be read
     * through `source`, e.g. to move them to another table. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param options - `where`, `returning`.
     * @returns Statement for the `with` option.
     * @example
     * ```ts
     * const done = Task.deleteStatement({ where: { done: true }, returning: true });
     * const removed = await Task.findAll({ with: { done }, source: 'done' });
     * ```
     */
    static deleteStatement<M extends AnyModel>(
      this: ModelStatic<M>,
      options: WriteStatementOptions<Attributes<M>> = {},
    ): WriteStatement {
      return statements.delete(this, options as WriteStatementOptions);
    }

    /**
     * Builds an `INSERT` of attribute-keyed rows for a data-modifying CTE (`with`). Defaults and
     * timestamps are filled in; no hooks or validation run. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param rows - Rows to insert (at least one).
     * @param options - `returning`.
     * @returns Statement for the `with` option.
     * @throws Error without rows.
     * @example
     * ```ts
     * const added = Task.insertStatement([{ title: 'write docs' }], { returning: true });
     * const rows = await Task.findAll({ with: { added }, source: 'added' });
     * ```
     */
    static insertStatement<M extends AnyModel>(
      this: ModelStatic<M>,
      rows: readonly CreationAttributes<M>[],
      options: Pick<WriteStatementOptions<Attributes<M>>, 'returning'> = {},
    ): WriteStatement {
      return statements.insert(this, rows as readonly Values[], options);
    }

    /**
     * Streams rows with a server-side cursor (`DECLARE ... CURSOR` + `FETCH n`), so large result sets
     * are not loaded at once. Runs inside `options.transaction` or its own transaction; the cursor is
     * closed when iteration ends or is stopped early. Joined includes are not supported. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param options - Find options.
     * @param cursor - `batchSize` (rows per FETCH, default 100).
     * @returns Async iterator of instances.
     * @example
     * ```ts
     * for await (const user of User.findEach({ where: { active: true } }, { batchSize: 500 })) {
     *   console.log(user.get('email'));
     * }
     * ```
     */
    static findEach<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> = {},
      cursor: Readonly<{ batchSize?: number }> = {},
    ): AsyncGenerator<M, void, undefined> {
      return finder.findEach(this, options as FindOptions, cursor);
    }

    /**
     * Bulk-loads rows with `COPY ... FROM STDIN` (text format) — much faster than INSERT for large
     * volumes. No hooks or validation run; missing values are written as `NULL`. `createdAt` /
     * `updatedAt` are filled when the model has timestamps. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param rows - Rows (array, iterable or async iterable of attribute values).
     * @param options - `columns` (attribute names; default: keys of the first row of an array) and query options.
     * @returns Number of copied rows.
     * @example
     * ```ts
     * const copied = await Task.copyFrom(
     *   [{ title: 'first' }, { title: 'second' }],
     *   { columns: ['title'] },
     * );
     * ```
     */
    static copyFrom<M extends AnyModel>(
      this: ModelStatic<M>,
      rows: Iterable<CreationAttributes<M>> | AsyncIterable<CreationAttributes<M>>,
      options: CopyFromOptions<Attributes<M>> = {},
    ): Promise<number> {
      return copier.copyFrom(
        this,
        rows as Iterable<Values> | AsyncIterable<Values>,
        options as CopyFromOptions,
      );
    }

    /**
     * Streams `COPY (SELECT ...) TO STDOUT` output — the fastest way to export rows (e.g. CSV). Default
     * scope, paranoid filter, `with` / `source` and includes apply. Values of the query are inlined as
     * escaped literals because COPY cannot take parameters (ADR-013). Stopping early drains the rest
     * before the connection is released. PostgreSQL extension.
     *
     * @postgrelize
     * @param this - The model class.
     * @param options - Find options and output format (`format`, `header`, ...).
     * @returns Async iterator of raw output chunks.
     * @example
     * ```ts
     * for await (const chunk of User.copyTo({ attributes: ['id', 'email'], format: 'csv', header: true })) {
     *   process.stdout.write(chunk);
     * }
     * ```
     */
    static copyTo<M extends AnyModel>(
      this: ModelStatic<M>,
      options: CopyToOptions<Attributes<M>> = {},
    ): AsyncGenerator<Buffer, void, undefined> {
      return copier.copyTo(this, options as CopyToOptions);
    }
  };
};
