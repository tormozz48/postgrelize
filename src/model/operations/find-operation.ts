import { randomUUID } from 'node:crypto';
import type { IncludeOption } from '../../associations/include.ts';
import type { IncludeLoader } from '../../associations/include-loader.ts';
import type { IncludeResolver } from '../../associations/include-resolver.ts';
import { EmptyResultError } from '../../errors/errors.ts';
import { Subquery } from '../../expressions/methods.ts';
import { SqlCompiler } from '../../sql/compile.ts';
import type { Transaction } from '../../transaction/transaction.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { FindQueryBuilder } from '../find-query-builder.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type {
  AnyModel,
  CreationAttributes,
  FindOptions,
  FindOrCreateOptions,
  ModelStatic,
  MutableOptions,
  Values,
} from '../options.ts';
import type { RowMapper } from '../row-mapper.ts';
import type { SelectOptions, SelectQueryBuilder } from '../select-query-builder.ts';
import type { WhereOptions } from '../types.ts';

/** Collaborators of {@link FindOperation}. */
export type FindOperationServices = Readonly<{
  /** Model state and scopes. */
  registry: ModelRegistry;
  /** Hooks. */
  lifecycle: InstanceLifecycle;
  /** Value rules. */
  values: ModelValues;
  /** Paranoid filter. */
  columns: AttributeColumns;
  /** Plain SELECT builder (`findEach`). */
  selects: SelectQueryBuilder;
  /** Finder SELECT builder. */
  finds: FindQueryBuilder;
  /** Row parsing. */
  rows: RowMapper;
  /** Include trees. */
  includes: IncludeResolver;
  /** Include row assembly and separate loading. */
  loader: IncludeLoader;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/**
 * Finders of `Model`: `findAll` (scopes, paranoid filter, hooks, includes, raw / nested rows),
 * `findOne`, `findByPk`, `findAndCountAll`, `findOrCreate`, `findOrBuild`, the cursor-based
 * `findEach` and embeddable `subquery`.
 */
export class FindOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #selects: SelectQueryBuilder;
  readonly #finds: FindQueryBuilder;
  readonly #rows: RowMapper;
  readonly #includes: IncludeResolver;
  readonly #loader: IncludeLoader;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: FindOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#selects = services.selects;
    this.#finds = services.finds;
    this.#rows = services.rows;
    this.#includes = services.includes;
    this.#loader = services.loader;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.findAll`.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @returns Instances, or plain objects with `raw: true`.
   */
  async findAll<M extends AnyModel>(model: ModelStatic<M>, options: FindOptions): Promise<M[]> {
    const { definition, runtime } = this.#registry.state(model);
    const opts: MutableOptions = { hooks: true, ...this.#registry.scoped(model, options) };
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeFind', opts);
      await this.#lifecycle.runHooks(model, 'beforeFindAfterExpandIncludeAll', opts);
      await this.#lifecycle.runHooks(model, 'beforeFindAfterOptions', opts);
    }
    const query = {
      ...(opts as FindOptions),
      where: this.#columns.paranoid(
        definition,
        opts['where'],
        opts['paranoid'] as boolean | undefined,
      ),
    };
    const includes = this.#includes.normalize(model, opts['include'] as IncludeOption | undefined);
    const select = this.#finds.build(
      definition,
      query as FindOptions,
      includes,
      runtime.inAsAnyThreshold,
    );
    const result = await runtime.execute(this.#compiler.compile(select), query, 'read');
    const parseMain = (row: Readonly<Record<string, unknown>>) => this.#rows.parse(definition, row);
    const found =
      opts['raw'] === true
        ? (result.rows
            .map((row) =>
              includes.length === 0
                ? parseMain(row)
                : this.#loader.parseRawRow(includes, row, parseMain),
            )
            .map((row) =>
              opts['nest'] === true ? this.#rows.nest(row as Values) : row,
            ) as unknown as M[])
        : includes.length === 0
          ? result.rows.map((row) => this.#rows.instance(model, row))
          : (this.#loader.assemble(
              model,
              includes,
              result.rows,
              parseMain,
              (target, values) => new target(values, { isNewRecord: false, raw: true }),
            ) as M[]);
    if (opts['raw'] !== true && includes.length > 0) {
      await this.#loader.loadSeparate(found, includes, query);
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterFind', found, opts);
    }
    return found;
  }

  /**
   * `Model.findOne`: `findAll` with `limit: 1` (unless given), honouring `rejectOnEmpty`.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @returns Instance or `null`.
   * @throws EmptyResultError (or the given error) with `rejectOnEmpty`.
   */
  async findOne<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOptions & Readonly<{ rejectOnEmpty?: boolean | Error }>,
  ): Promise<M | null> {
    const [first] = await model.findAll({ ...options, limit: options.limit ?? 1 });
    if (
      first === undefined &&
      options.rejectOnEmpty !== undefined &&
      options.rejectOnEmpty !== false
    ) {
      throw options.rejectOnEmpty instanceof Error ? options.rejectOnEmpty : new EmptyResultError();
    }
    return first ?? null;
  }

  /**
   * `Model.findByPk`.
   *
   * @param model - Model class.
   * @param key - Primary key value.
   * @param options - Find options.
   * @returns Instance or `null`.
   */
  async findByPk<M extends AnyModel>(
    model: ModelStatic<M>,
    key: unknown,
    options: Omit<FindOptions, 'where'>,
  ): Promise<M | null> {
    if (key === null || key === undefined) {
      return null;
    }
    const name = this.#registry.definition(model).primaryKeys[0] ?? 'id';
    return model.findOne({ ...options, where: { [name]: key } as WhereOptions });
  }

  /**
   * `Model.findAndCountAll`: `count` and `findAll` with the same filter, in parallel.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @returns Total count and rows.
   */
  async findAndCountAll<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOptions,
  ): Promise<Readonly<{ count: number; rows: M[] }>> {
    const [count, rows] = await Promise.all([
      model.count({
        ...(options.where === undefined ? {} : { where: options.where }),
        ...(options.include === undefined ? {} : { include: options.include }),
        ...(options.paranoid === undefined ? {} : { paranoid: options.paranoid }),
        ...this.#values.queryOptions(options),
      }),
      model.findAll(options),
    ]);
    return { count, rows };
  }

  /**
   * `Model.findOrCreate`: finds a row or creates it inside a transaction (re-reading it when a
   * concurrent insert wins).
   *
   * @param model - Model class.
   * @param options - `where` to search, `defaults` to add on creation.
   * @returns `[instance, created]`.
   */
  async findOrCreate<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
  ): Promise<[M, boolean]> {
    const { runtime } = this.#registry.state(model);
    const found = await model.findOne(options);
    if (found !== null) {
      return [found, false];
    }
    return runtime.transaction(async (transaction) => {
      const values = {
        ...this.#values.fromWhere(options.where),
        ...options.defaults,
      } as CreationAttributes<M>;
      try {
        return [
          await model.create(values, { transaction, ...this.#values.queryOptions(options) }),
          true,
        ];
      } catch (error) {
        const existing = await model.findOne({
          ...options,
          transaction: options.transaction ?? null,
        });
        if (existing === null) {
          throw error;
        }
        return [existing, false];
      }
    }, options.transaction);
  }

  /**
   * `Model.findOrBuild`: finds a row or builds (without saving) a new instance.
   *
   * @param model - Model class.
   * @param options - `where` to search, `defaults` to add when building.
   * @returns `[instance, built]`.
   */
  async findOrBuild<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
  ): Promise<[M, boolean]> {
    const found = await model.findOne(options);
    return found === null
      ? [
          model.build({ ...this.#values.fromWhere(options.where), ...options.defaults } as Values),
          true,
        ]
      : [found, false];
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
    const { definition, runtime } = this.#registry.state(model);
    const scoped = this.#registry.scoped(model, options);
    const includes = this.#includes.normalize(model, scoped.include);
    if (includes.some((node) => !node.separate)) {
      throw new Error('findEach does not support joined includes');
    }
    const batchSize = cursor.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('findEach: batchSize must be a positive integer');
    }
    const query = {
      ...scoped,
      where: this.#columns.paranoid(definition, scoped.where, scoped.paranoid),
    };
    const compiled = this.#compiler.compile(
      this.#selects.build(definition, query as SelectOptions, runtime.inAsAnyThreshold),
    );
    const own =
      options.transaction === undefined || options.transaction === null
        ? await runtime.beginTransaction()
        : undefined;
    const transaction = own ?? (options.transaction as Transaction);
    const name = SqlCompiler.quoteIdent(`pgz_cursor_${randomUUID().replaceAll('-', '')}`);
    const run = (text: string, values: readonly unknown[] = []) =>
      runtime.execute({ text, values }, { ...this.#values.queryOptions(options), transaction });
    let failed = false;
    try {
      await run(`DECLARE ${name} NO SCROLL CURSOR FOR ${compiled.text}`, compiled.values);
      for (;;) {
        const batch = await run(`FETCH ${batchSize} FROM ${name}`);
        if (batch.rows.length === 0) {
          break;
        }
        const instances = batch.rows.map((row) => this.#rows.instance(model, row));
        if (includes.length > 0) {
          await this.#loader.loadSeparate(instances, includes, { transaction });
        }
        yield* instances;
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (own === undefined) {
        await run(`CLOSE ${name}`).catch(() => undefined);
      } else if (failed) {
        await own.rollback().catch(() => undefined);
      } else {
        await own.commit();
      }
    }
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
    return new Subquery(() => {
      const { definition, runtime } = this.#registry.state(model);
      const { as, ...findOptions } = options;
      const scoped = this.#registry.scoped(model, findOptions as FindOptions);
      const query = {
        ...scoped,
        where: this.#columns.paranoid(definition, scoped.where, scoped.paranoid),
      };
      const includes = this.#includes.normalize(model, query.include);
      return this.#finds.build(
        definition,
        query as FindOptions,
        includes,
        runtime.inAsAnyThreshold,
        as,
      );
    });
  }
}
