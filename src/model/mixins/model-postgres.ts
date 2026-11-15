import type { Subquery } from '../../expressions/methods.ts';
import type { MergeOptions } from '../merge-query-builder.ts';
import { copier, finder, inserter, merger } from '../model-operations.ts';
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
import type { ModelConstructor } from './model-constructor.ts';

/**
 * PostgreSQL extension statics of `Model`: `insert`, `insertFrom`, `merge`, `subquery`, `findEach`, `copyFrom`, `copyTo`.
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
     * @param values - Attribute values of one row or several rows.
     * @param options - Insert options.
     * @returns Instances of the rows written by the statement.
     * @example
     * ```ts
     * const rows = await Stock.insert(items, {
     *   onConflict: { target: ['sku'], action: { update: { qty: literal('"Stock"."qty" + EXCLUDED."qty"') } } },
     * });
     * rows.filter((row) => row.wasInserted);
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
     * @param source - Subquery from `Model.subquery()`; its columns must match `options.columns`.
     * @param options - Target columns, `onConflict` and query options.
     * @returns Written rows.
     * @example
     * ```ts
     * await Archive.insertFrom(Post.subquery({ attributes: ['id', 'title'], where: { published: false } }), { columns: ['postId', 'title'] });
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
     * @param options - Source, join condition and WHEN clauses.
     * @returns Affected row count and, with `returning`, `{ action, instance }` per row.
     * @example
     * ```ts
     * await Stock.merge({
     *   source: [{ sku: 'a', qty: 5 }],
     *   on: { sku: col('source.sku') },
     *   whenMatched: { update: { qty: literal('"Stock"."qty" + "source"."qty"') } },
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
     * Streams rows with a server-side cursor (`DECLARE ... CURSOR` + `FETCH n`), so large result sets
     * are not loaded at once. Runs inside `options.transaction` or its own transaction; the cursor is
     * closed when iteration ends or is stopped early. Joined includes are not supported. PostgreSQL extension.
     *
     * @param options - Find options.
     * @param cursor - `batchSize` (rows per FETCH, default 100).
     * @returns Async iterator of instances.
     * @example
     * ```ts
     * for await (const user of User.findEach({ where: { active: true } }, { batchSize: 500 })) {
     *   await sendEmail(user);
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
     * @param rows - Rows (array, iterable or async iterable of attribute values).
     * @param options - `columns` (attribute names; default: keys of the first row of an array) and query options.
     * @returns Number of copied rows.
     * @example
     * ```ts
     * await Event.copyFrom(readEvents(), { columns: ['type', 'payload'] });
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
     * @param options - Find options and output format.
     * @returns Async iterator of raw output chunks.
     * @example
     * ```ts
     * for await (const chunk of User.copyTo({ attributes: ['id', 'email'], format: 'csv', header: true })) {
     *   response.write(chunk);
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
