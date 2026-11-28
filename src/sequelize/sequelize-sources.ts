import { Subquery } from '../expressions/methods.ts';
import { cteBuilder, joinSources, sqlCompiler } from '../model/model-services.ts';
import { runtimeKey, type QueryOptionsBase, type RuntimeOwner } from '../model/runtime.ts';
import type { SourceQueryOptions } from '../model/source-query-options.ts';
import { SourceSelectBuilder } from '../model/source-select-builder.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

const selects = new SourceSelectBuilder(joinSources, cteBuilder);

/**
 * Model-less queries of `Sequelize` (PostgreSQL extension): `select` and `subquery`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeSources = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class SourcesCapability extends Base {
    /**
     * Runs a SELECT whose FROM is not a model (`unnest`, `generate_series`, jsonb functions,
     * `VALUES`, subqueries, `LATERAL`). No scope, paranoid filter or model hook applies. Values are
     * bound. PostgreSQL extension.
     *
     * @postgrelize
     * @typeParam T - Row type.
     * @param options - Sources and clauses, plus query options (`transaction`, `logging`, `useMaster`, …).
     * @returns Rows as the driver returns them.
     * @throws DatabaseError subclasses mapped from the PostgreSQL error.
     * @see {@link Sequelize.subquery}
     *
     * @example
     * ```ts
     * const days = await sequelize.select<{ day: Date }>({
     *   from: {
     *     day: {
     *       function: 'generate_series',
     *       args: [cast('2026-01-01', 'date'), cast('2026-01-03', 'date'), cast('1 day', 'interval')],
     *     },
     *   },
     * });
     * ```
     */
    async select<T extends object = Record<string, unknown>>(
      options: SourceQueryOptions & QueryOptionsBase,
    ): Promise<T[]> {
      const node = selects.build(options);
      const runtime = (this as unknown as RuntimeOwner)[runtimeKey];
      const result = await runtime.execute(
        sqlCompiler.compile(node),
        options,
        cteBuilder.route(node),
      );
      return result.rows as T[];
    }

    /**
     * The same SELECT as {@link Sequelize.select} as an expression: `exists()`, `Op.in`,
     * `Model.insertFrom`, `from`, `joins`, `with`, set operations. It may reference columns of the
     * outer query with `col()`. PostgreSQL extension.
     *
     * @postgrelize
     * @param options - Sources and clauses.
     * @returns Subquery expression.
     *
     * @example
     * ```ts
     * const source = sequelize.subquery({
     *   from: { t: { function: 'unnest', args: [cast(['a'], 'text[]')], columns: ['title'] } },
     *   attributes: ['t.title'],
     * });
     * await Post.insertFrom(source, { columns: ['title'] });
     * ```
     */
    subquery(options: SourceQueryOptions): Subquery {
      return new Subquery(() => selects.build(options));
    }
  };
