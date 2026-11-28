import { InstanceState } from '../instance-state.ts';
import { AliasMinifier } from '../../associations/alias-minifier.ts';
import type { SelectNode } from '../../sql/ast.ts';
import type { IncludeNode, IncludeOption } from '../../associations/include.ts';
import type { QueryResult } from '../../connection/connection-manager.ts';
import { SqlLiteral } from '../../ddl/sql-literal.ts';
import { Subquery } from '../../expressions/methods.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { AnyModel, FindOptions, ModelStatic, MutableOptions, Values } from '../options.ts';
import { FindCursor } from './find-cursor.ts';
import { FindLookups, type FindOperationServices } from './find-lookups.ts';
import { GroupedLimit } from './grouped-limit.ts';
import { VirtualSelection } from './virtual-selection.ts';

export type { FindOperationServices } from './find-lookups.ts';

type Row = Readonly<Record<string, unknown>>;

// One `Model.findAll` call after the `before` hooks: hook-visible options, query and includes.
type FindCall = Readonly<{
  model: ModelStatic<AnyModel>;
  definition: ModelDefinition;
  opts: MutableOptions;
  query: FindOptions;
  includes: readonly IncludeNode[];
  addedKey?: string;
}>;

const selection = new VirtualSelection();

/**
 * Finders of `Model`: `findAll` (scopes, paranoid filter, hooks, includes, raw / nested rows),
 * `findOne`, `findByPk`, `findAndCountAll`, `findOrCreate`, `findOrBuild`, the cursor-based
 * `findEach` and embeddable `subquery`.
 */
export class FindOperation extends FindLookups {
  readonly #cursor: FindCursor;
  readonly #minifier = new AliasMinifier();
  readonly #grouped = new GroupedLimit();

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
    const opts: MutableOptions = { hooks: true, ...this.services.registry.scoped(model, options) };
    await this.#beforeFind(model, opts);
    const found =
      opts['groupedLimit'] === undefined
        ? await this.#read(model, opts)
        : ((await this.#grouped.rows(model, opts)) as AnyModel[]);
    await this.#afterFind(model, opts, found);
    this.rejectEmpty(model, opts, found);
    return found as M[];
  }

  async #read(model: ModelStatic<AnyModel>, opts: MutableOptions): Promise<AnyModel[]> {
    const { runtime } = this.services.registry.state(model);
    const { finds } = this.services;
    const call = this.#call(model, opts);
    const { definition, query, includes } = call;
    const select = finds.build(definition, query, includes, runtime.inAsAnyThreshold);
    const rows = await this.#rows(select, call, runtime.minifyAliases === true);
    return this.#found(call, rows);
  }

  // like v6, `findOne` (`plain`) hands the instance, not an array, to the hooks
  async #afterFind(model: object, opts: MutableOptions, found: AnyModel[]): Promise<void> {
    if (opts['hooks'] === true) {
      const result = opts['plain'] === true ? (found[0] ?? null) : found;
      await this.services.lifecycle.runHooks(model, 'afterFind', result, opts);
    }
  }

  async #rows(select: SelectNode, call: FindCall, minify: boolean): Promise<QueryResult['rows']> {
    const { compiler, finds } = this.services;
    const { runtime } = this.services.registry.state(call.model);
    const joined = call.includes.filter((node) => !node.separate);
    if (!minify || joined.length === 0) {
      return (await runtime.execute(compiler.compile(select), call.query, finds.route(select)))
        .rows;
    }
    const minified = this.#minifier.minify(select, joined);
    const query = this.#minifier.rewrite(compiler.compile(minified.select), minified);
    const result = await runtime.execute(query, call.query, finds.route(select));
    return this.#minifier.restore(result.rows, minified) as QueryResult['rows'];
  }

  // Conforming the includes only matters to a hook that reads them, so a find without one skips it.
  #hasExpandHooks(model: object): boolean {
    const { hooks, runtime } = this.services.registry.state(model);
    return [hooks, runtime.hooks()].some((registry) =>
      registry.has('beforeFindAfterExpandIncludeAll'),
    );
  }

  async #beforeFind(model: object, opts: MutableOptions): Promise<void> {
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'beforeFind', opts);
      if (opts['include'] !== undefined && this.#hasExpandHooks(model)) {
        opts['include'] = this.services.includes.conform(
          model as ModelStatic<AnyModel>,
          opts['include'] as IncludeOption,
        );
      }
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
    const sourced = this.#withSourceKeys(query, nodes);
    const keyed = this.#withPrimaryKey(sourced, definition, nodes);
    return {
      model,
      definition,
      opts,
      query: keyed as FindOptions,
      includes: nodes,
      ...(keyed === sourced ? {} : { addedKey: definition.primaryKeys[0] as string }),
    };
  }

  // v6 selects the primary key of a find with includes so that joined rows can be de-duplicated
  #withPrimaryKey(
    query: Record<string, unknown>,
    definition: ModelDefinition,
    nodes: readonly IncludeNode[],
  ): Record<string, unknown> {
    const { attributes } = query;
    const [key] = definition.primaryKeys;
    if (key === undefined || !Array.isArray(attributes) || !this.#needsKey(query, nodes)) {
      return query;
    }
    const names = attributes.map((entry) => (Array.isArray(entry) ? entry[1] : entry));
    return names.includes(key) ? query : { ...query, attributes: [key, ...attributes] };
  }

  #needsKey(query: Record<string, unknown>, nodes: readonly IncludeNode[]): boolean {
    const onlySingle =
      !nodes.some((node) => node.association.isMultiAssociation) &&
      nodes.some((node) => !node.association.isMultiAssociation);
    return (
      nodes.length > 0 && query['raw'] !== true && !(query['group'] !== undefined && onlySingle)
    );
  }

  // a separate include matches children by the parent's source key, so it must be selected (v6 adds it)
  #withSourceKeys(query: Record<string, unknown>, nodes: readonly IncludeNode[]): FindOptions {
    const { attributes } = query;
    const keys = nodes.filter((node) => node.separate).map((node) => node.association.sourceKey);
    if (!Array.isArray(attributes) || keys.length === 0) {
      return query as FindOptions;
    }
    const names = attributes.map((entry) => (Array.isArray(entry) ? entry[1] : entry));
    const missing = [...new Set(keys)].filter((key) => !names.includes(key));
    return (
      missing.length === 0 ? query : { ...query, attributes: [...attributes, ...missing] }
    ) as FindOptions;
  }

  async #found(call: FindCall, rows: QueryResult['rows']): Promise<AnyModel[]> {
    if (call.opts['raw'] === true) {
      return this.#raw(call, rows);
    }
    const found = this.#instances(call, rows);
    selection.apply(call.definition, call.opts['attributes'], found);
    if (call.includes.length > 0) {
      await this.services.loader.loadSeparate(found, call.includes, call.query);
    }
    return this.#withoutAddedKey(found, call.addedKey);
  }

  #instances({ model, definition, includes }: FindCall, rows: QueryResult['rows']): AnyModel[] {
    if (includes.length === 0) {
      return rows.map((row) => this.services.rows.instance(model, row));
    }
    const found = this.services.loader.assemble(
      model,
      includes,
      rows,
      (row: Row) => this.services.rows.parse(definition, row),
      (target, values) =>
        this.services.rows.queried(new target(values, { isNewRecord: false, raw: true })),
    ) as AnyModel[];
    return this.#markLoaded(found, includes);
  }

  #markLoaded(found: AnyModel[], includes: readonly IncludeNode[]): AnyModel[] {
    // `reload()` loads the same includes again, like v6 (`_options.include`)
    found.forEach((instance) => {
      InstanceState.of(instance).loadedIncludes = includes;
    });
    return found;
  }

  // selected only to tell joined rows apart (and to match separate includes): not part of the
  // result, like v6 `originalAttributes`
  #withoutAddedKey(found: AnyModel[], key: string | undefined): AnyModel[] {
    if (key !== undefined) {
      found.forEach((instance) => Reflect.deleteProperty(instance.dataValues as Values, key));
    }
    return found;
  }

  #raw({ definition, opts, includes }: FindCall, rows: QueryResult['rows']): AnyModel[] {
    const { loader, rows: mapper } = this.services;
    const nest = (row: Row): Row => (opts['nest'] === true ? mapper.nest(row as Values) : row);
    if (includes.length === 0) {
      const parsed = mapper.parseAllOwned(definition, rows);
      return (opts['nest'] === true ? parsed.map(nest) : [...parsed]) as unknown as AnyModel[];
    }
    const parseMain = (row: Row) => mapper.parse(definition, row);
    return rows.map((row) =>
      nest(loader.parseRawRow(includes, row, parseMain)),
    ) as unknown as AnyModel[];
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

  /**
   * SQL text of a finder, values written as escaped literals (v6 `queryGenerator.selectQuery`): no
   * scope, paranoid filter or hook is applied, nothing is executed.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @returns SELECT statement ending with `;`.
   */
  selectSql(model: ModelStatic<AnyModel>, options: FindOptions): string {
    const { definition, runtime } = this.services.registry.state(model);
    const nodes = this.services.includes.normalize(model, options.include);
    const select = this.services.finds.build(definition, options, nodes, runtime.inAsAnyThreshold);
    return `${new SqlLiteral().inlineValues(this.services.compiler.compile(select))};`;
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
