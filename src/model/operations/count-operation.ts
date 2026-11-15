import type { IncludeOption } from '../../associations/include.ts';
import type { IncludeQueryBuilder } from '../../associations/include-query-builder.ts';
import type { IncludeResolver } from '../../associations/include-resolver.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { CteBuilder } from '../cte-builder.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
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

/** Collaborators of {@link CountOperation}. */
export type CountOperationServices = Readonly<{
  /** Model state and scopes. */
  registry: ModelRegistry;
  /** Hooks. */
  lifecycle: InstanceLifecycle;
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

/** `Model.count` (with includes and `group`) and `Model.aggregate` (`max`, `min`, `sum`, ...). */
export class CountOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #columns: AttributeColumns;
  readonly #selects: SelectQueryBuilder;
  readonly #cte: CteBuilder;
  readonly #rows: RowMapper;
  readonly #includes: IncludeResolver;
  readonly #includeQueries: IncludeQueryBuilder;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: CountOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#columns = services.columns;
    this.#selects = services.selects;
    this.#cte = services.cte;
    this.#rows = services.rows;
    this.#includes = services.includes;
    this.#includeQueries = services.includeQueries;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.count` (default scope and paranoid filter applied).
   *
   * @param model - Model class.
   * @param options - Count options.
   * @returns Count, or `{ count, ...groups }[]` with `group`.
   */
  async count(model: ModelStatic<AnyModel>, options: CountOptions): Promise<number> {
    const { definition, runtime } = this.#registry.state(model);
    const opts: MutableOptions = { hooks: true, ...this.#registry.scoped(model, options) };
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeCount', opts);
    }
    const query = {
      ...(opts as CountOptions),
      where: this.#columns.paranoid(
        definition,
        opts['where'],
        opts['paranoid'] as boolean | undefined,
      ),
    };
    const includes = this.#includes.normalize(model, opts['include'] as IncludeOption | undefined);
    const countQuery = (
      includes.length === 0 || query.col !== undefined
        ? query
        : {
            ...query,
            col: `${definition.name}.${definition.attributes.get(definition.primaryKeys[0] ?? 'id')?.field ?? 'id'}`,
          }
    ) as SelectOptions & CountOptions;
    const counted = this.#selects.count(
      this.#cte.sourceDefinition(definition, query.source),
      { ...countQuery, ...this.#cte.selectOptions(query) },
      runtime.inAsAnyThreshold,
    );
    const select =
      includes.length === 0
        ? counted
        : { ...counted, joins: this.#includeQueries.countJoins(definition, includes) };
    const result = await runtime.execute(this.#compiler.compile(select), query, 'read');
    if (query.group !== undefined) {
      return result.rows.map((row) => ({
        ...this.#rows.parse(definition, row),
        count: Number(row['count']),
      })) as unknown as number;
    }
    return Number(result.rows[0]?.['count'] ?? 0);
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
    const { definition, runtime } = this.#registry.state(model);
    const scoped = this.#registry.scoped(model, options);
    const query = {
      ...scoped,
      where: this.#columns.paranoid(definition, scoped.where, scoped.paranoid),
    };
    const result = await runtime.execute(
      this.#compiler.compile(
        this.#selects.aggregate(
          definition,
          field,
          aggregateFunction,
          query as SelectOptions,
          runtime.inAsAnyThreshold,
        ),
      ),
      query,
      'read',
    );
    const attribute = definition.attributes.get(field);
    if (options.plain === false) {
      return result.rows.map((row) => ({
        ...row,
        [aggregateFunction]: this.#rows.aggregate(
          attribute,
          aggregateFunction,
          row[aggregateFunction],
        ),
      }));
    }
    return this.#rows.aggregate(attribute, aggregateFunction, result.rows[0]?.[aggregateFunction]);
  }
}
