import type { IncludeOption } from '../../associations/include.ts';
import type { IncludeQueryBuilder } from '../../associations/include-query-builder.ts';
import type { IncludeResolver } from '../../associations/include-resolver.ts';
import type { QueryResult } from '../../connection/connection-manager.ts';
import { AbstractDataType } from '../../data-types/abstract-data-type.ts';
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
    const result = await runtime.execute(
      compiler.compile(select),
      query,
      this.services.cte.route(select),
    );
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
    if (query.joins !== undefined && includes.length > 0) {
      throw new Error('joins cannot be combined with a joined include');
    }
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
   * @returns Aggregated value (the raw driver rows with `plain: false`, like v6: numeric results
   * such as `sum` arrive as strings).
   */
  async aggregate(
    model: ModelStatic<AnyModel>,
    field: string,
    aggregateFunction: string,
    options: AggregateOptions,
  ): Promise<unknown> {
    const { definition, runtime } = this.services.registry.state(model);
    const { compiler, registry } = this.services;
    const query = this.#filtered(definition, registry.scoped(model, options));
    const select = this.#aggregateSelect(model, field, aggregateFunction, query as SelectOptions);
    const result = await runtime.execute(compiler.compile(select), query, 'read');
    return this.#aggregated(definition, field, aggregateFunction, options, result.rows);
  }

  // like v6, the includes (also those of the scope) are joined, so their `where` filters the rows
  #aggregateSelect(
    model: ModelStatic<AnyModel>,
    field: string,
    aggregateFunction: string,
    query: SelectOptions,
  ) {
    const { definition, runtime } = this.services.registry.state(model);
    const { includes, includeQueries, selects } = this.services;
    const threshold = runtime.inAsAnyThreshold;
    const select = selects.aggregate(definition, field, aggregateFunction, query, threshold);
    const option = (query as Readonly<{ include?: IncludeOption }>).include;
    const nodes = includes.normalize(model, option);
    return nodes.length === 0
      ? select
      : { ...select, joins: includeQueries.countJoins(definition, nodes) };
  }

  #aggregated(
    definition: ModelDefinition,
    field: string,
    aggregateFunction: string,
    options: AggregateOptions,
    rows: QueryResult['rows'],
  ): unknown {
    if (options.plain === false) {
      return rows;
    }
    const attribute =
      options.dataType === undefined
        ? definition.attributes.get(field)
        : { type: AbstractDataType.from(options.dataType) };
    const mapper = this.services.rows;
    return mapper.aggregate(attribute, aggregateFunction, rows[0]?.[aggregateFunction]);
  }
}
