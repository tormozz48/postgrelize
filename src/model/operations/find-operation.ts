import type { IncludeNode, IncludeOption } from '../../associations/include.ts';
import type { QueryResult } from '../../connection/connection-manager.ts';
import { Subquery } from '../../expressions/methods.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { AnyModel, FindOptions, ModelStatic, MutableOptions, Values } from '../options.ts';
import { FindCursor } from './find-cursor.ts';
import { FindLookups, type FindOperationServices } from './find-lookups.ts';

export type { FindOperationServices } from './find-lookups.ts';

type Row = Readonly<Record<string, unknown>>;

// One `Model.findAll` call after the `before` hooks: hook-visible options, query and includes.
type FindCall = Readonly<{
  model: ModelStatic<AnyModel>;
  definition: ModelDefinition;
  opts: MutableOptions;
  query: FindOptions;
  includes: readonly IncludeNode[];
}>;

/**
 * Finders of `Model`: `findAll` (scopes, paranoid filter, hooks, includes, raw / nested rows),
 * `findOne`, `findByPk`, `findAndCountAll`, `findOrCreate`, `findOrBuild`, the cursor-based
 * `findEach` and embeddable `subquery`.
 */
export class FindOperation extends FindLookups {
  readonly #cursor: FindCursor;

  /**
   * @param services - Collaborators.
   */
  constructor(services: FindOperationServices) {
    super(services);
    this.#cursor = new FindCursor(services);
  }

  /**
   * `Model.findAll`.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @returns Instances, or plain objects with `raw: true`.
   */
  async findAll<M extends AnyModel>(model: ModelStatic<M>, options: FindOptions): Promise<M[]> {
    const { definition, runtime } = this.services.registry.state(model);
    const { compiler, finds, lifecycle } = this.services;
    const opts: MutableOptions = { hooks: true, ...this.services.registry.scoped(model, options) };
    await this.#beforeFind(model, opts);
    const call = this.#call(model, opts);
    const threshold = runtime.inAsAnyThreshold;
    const select = finds.build(definition, call.query, call.includes, threshold);
    const result = await runtime.execute(compiler.compile(select), call.query, finds.route(select));
    const found = await this.#found(call, result.rows);
    if (opts['hooks'] === true) {
      await lifecycle.runHooks(model, 'afterFind', found, opts);
    }
    return found as M[];
  }

  async #beforeFind(model: object, opts: MutableOptions): Promise<void> {
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'beforeFind', opts);
      await this.services.lifecycle.runHooks(model, 'beforeFindAfterExpandIncludeAll', opts);
      await this.services.lifecycle.runHooks(model, 'beforeFindAfterOptions', opts);
    }
  }

  #call(model: ModelStatic<AnyModel>, opts: MutableOptions): FindCall {
    const { definition } = this.services.registry.state(model);
    const { columns, includes } = this.services;
    const query = {
      ...(opts as FindOptions),
      where: columns.paranoid(definition, opts['where'], opts['paranoid'] as boolean | undefined),
    };
    const nodes = includes.normalize(model, opts['include'] as IncludeOption | undefined);
    return { model, definition, opts, query: query as FindOptions, includes: nodes };
  }

  async #found(call: FindCall, rows: QueryResult['rows']): Promise<AnyModel[]> {
    if (call.opts['raw'] === true) {
      return this.#raw(call, rows);
    }
    const found = this.#instances(call, rows);
    if (call.includes.length > 0) {
      await this.services.loader.loadSeparate(found, call.includes, call.query);
    }
    return found;
  }

  #instances({ model, definition, includes }: FindCall, rows: QueryResult['rows']): AnyModel[] {
    return includes.length === 0
      ? rows.map((row) => this.services.rows.instance(model, row))
      : (this.services.loader.assemble(
          model,
          includes,
          rows,
          (row: Row) => this.services.rows.parse(definition, row),
          (target, values) => new target(values, { isNewRecord: false, raw: true }),
        ) as AnyModel[]);
  }

  #raw({ definition, opts, includes }: FindCall, rows: QueryResult['rows']): AnyModel[] {
    const { loader, rows: mapper } = this.services;
    const parseMain = (row: Row) => mapper.parse(definition, row);
    return rows.map((row) => {
      const parsed =
        includes.length === 0
          ? mapper.parseOwned(definition, row)
          : loader.parseRawRow(includes, row, parseMain);
      return opts['nest'] === true ? mapper.nest(parsed as Values) : parsed;
    }) as unknown as AnyModel[];
  }

  /**
   * `Model.findEach`: streams rows with a server-side cursor inside `options.transaction` or its
   * own transaction; the cursor is closed when iteration ends or is stopped early.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @param cursor - `batchSize` (rows per FETCH, default 100).
   * @returns Async iterator of instances.
   * @throws Error for joined includes or an invalid batch size.
   */
  async *findEach<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOptions,
    cursor: Readonly<{ batchSize?: number }>,
  ): AsyncGenerator<M, void, undefined> {
    yield* this.#cursor.each(model, options, cursor);
  }

  /**
   * `Model.subquery`: a SELECT embeddable in another query, built when the outer query compiles.
   *
   * @param model - Model class.
   * @param options - Find options and `as` (table alias).
   * @returns Subquery expression.
   */
  subquery(
    model: ModelStatic<AnyModel>,
    options: FindOptions & Readonly<{ as?: string }>,
  ): Subquery {
    return new Subquery(() => this.#subquerySelect(model, options));
  }

  #subquerySelect(model: ModelStatic<AnyModel>, options: FindOptions & Readonly<{ as?: string }>) {
    const { definition, runtime } = this.services.registry.state(model);
    const { columns, finds, includes, registry } = this.services;
    const { as, ...findOptions } = options;
    const scoped = registry.scoped(model, findOptions as FindOptions);
    const query = {
      ...scoped,
      where: columns.paranoid(definition, scoped.where, scoped.paranoid),
    };
    const nodes = includes.normalize(model, query.include);
    return finds.build(definition, query as FindOptions, nodes, runtime.inAsAnyThreshold, as);
  }
}
