import type { IncludeOption } from '../../associations/include.ts';
import type { IncludeQueryBuilder } from '../../associations/include-query-builder.ts';
import type { IncludeResolver } from '../../associations/include-resolver.ts';
import type { QueryResult } from '../../connection/connection-manager.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { CteBuilder } from '../cte-builder.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type {
  AggregateOptions,
  AnyModel,
  CountOptions,
  ModelStatic,
  MutableOptions,
} from '../options.ts';
import type { RowMapper } from '../row-mapper.ts';
import type { SelectOptions, SelectQueryBuilder } from '../select-query-builder.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link CountOperation}. */
export type CountOperationServices = OperationServices &
  Readonly<{
    /** Model state and scopes. */
    registry: ModelRegistry;
    /** Paranoid filter. */
    columns: AttributeColumns;
    /** SELECT builder. */
    selects: SelectQueryBuilder;
    /** CTE options. */
    cte: CteBuilder;
    /** Row parsing. */
    rows: RowMapper;
    /** Include trees. */
    includes: IncludeResolver;
    /** Include count joins. */
    includeQueries: IncludeQueryBuilder;
    /** SQL compiler. */
    compiler: SqlCompiler;
  }>;

// Count options after scopes and the paranoid filter.
type CountQuery = Omit<CountOptions, 'where'> & Readonly<{ where: unknown }>;

/** `Model.count` (with includes and `group`) and `Model.aggregate` (`max`, `min`, `sum`, ...). */
export class CountOperation extends ModelOperation<CountOperationServices> {
  /**
   * `Model.count` (default scope and paranoid filter applied).
   *
   * @param model - Model class.
   * @param options - Count options.
   * @returns Count, or `{ count, ...groups }[]` with `group`.
   */
  async count(model: ModelStatic<AnyModel>, options: CountOptions): Promise<number> {
    const { definition, runtime } = this.services.registry.state(model);
    const { compiler, includes, lifecycle } = this.services;
    const opts: MutableOptions = { hooks: true, ...this.services.registry.scoped(model, options) };
    if (opts['hooks'] === true) {
      await lifecycle.runHooks(model, 'beforeCount', opts);
    }
    const query = this.#filtered(definition, opts as CountOptions) as CountQuery;
    const normalized = includes.normalize(model, opts['include'] as IncludeOption | undefined);
    const select = this.#countSelect(model, query, normalized);
    const result = await runtime.execute(compiler.compile(select), query, 'read');
    return this.#counted(definition, query, result.rows);
  }

  #filtered<Q extends Readonly<{ where?: unknown; paranoid?: boolean }>>(
    definition: ModelDefinition,
    query: Q,
  ): Omit<Q, 'where'> & Readonly<{ where: unknown }> {
    return {
      ...query,
      where: this.services.columns.paranoid(definition, query.where, query.paranoid),
    };
  }

  #counted(definition: ModelDefinition, query: CountQuery, rows: QueryResult['rows']): number {
    if (query.group !== undefined) {
      return rows.map((row) => ({
        ...this.services.rows.parse(definition, row),
        count: Number(row['count']),
      })) as unknown as number;
    }
    return Number(rows[0]?.['count'] ?? 0);
  }

  #countSelect(
    model: ModelStatic<AnyModel>,
    query: CountQuery,
    includes: ReturnType<IncludeResolver['normalize']>,
  ) {
    const { definition, runtime } = this.services.registry.state(model);
    const { cte, includeQueries, selects } = this.services;
    const countQuery = CountOperation.#countQuery(definition, query, includes.length);
    const counted = selects.count(
      cte.sourceDefinition(definition, query.source),
      { ...countQuery, ...cte.selectOptions(query) },
      runtime.inAsAnyThreshold,
    );
    return includes.length === 0
      ? counted
      : { ...counted, joins: includeQueries.countJoins(definition, includes) };
  }

  static #countQuery(
    definition: ModelDefinition,
    query: CountQuery,
    includes: number,
  ): SelectOptions & CountOptions {
    if (includes === 0 || query.col !== undefined) {
      return query as SelectOptions & CountOptions;
    }
    const field = definition.attributes.get(definition.primaryKeys[0] ?? 'id')?.field ?? 'id';
    return { ...query, col: `${definition.name}.${field}` } as SelectOptions & CountOptions;
  }

  /**
   * `Model.aggregate`: runs an aggregate function over a column.
   *
   * @param model - Model class.
   * @param field - Attribute name or `'*'`.
   * @param aggregateFunction - SQL aggregate function name, e.g. `'max'`.
   * @param options - Options.
   * @returns Aggregated value (rows with `plain: false`).
   */
  async aggregate(
    model: ModelStatic<AnyModel>,
    field: string,
    aggregateFunction: string,
    options: AggregateOptions,
  ): Promise<unknown> {
    const { definition, runtime } = this.services.registry.state(model);
    const { compiler, registry, selects } = this.services;
    const query = this.#filtered(definition, registry.scoped(model, options));
    const threshold = runtime.inAsAnyThreshold;
    const select = selects.aggregate(
      definition,
      field,
      aggregateFunction,
      query as SelectOptions,
      threshold,
    );
    const result = await runtime.execute(compiler.compile(select), query, 'read');
    return this.#aggregated(definition, field, aggregateFunction, options, result.rows);
  }

  #aggregated(
    definition: ModelDefinition,
    field: string,
    aggregateFunction: string,
    options: AggregateOptions,
    rows: QueryResult['rows'],
  ): unknown {
    const attribute = definition.attributes.get(field);
    const mapper = this.services.rows;
    if (options.plain === false) {
      return rows.map((row) => ({
        ...row,
        [aggregateFunction]: mapper.aggregate(attribute, aggregateFunction, row[aggregateFunction]),
      }));
    }
    return mapper.aggregate(attribute, aggregateFunction, rows[0]?.[aggregateFunction]);
  }
}
