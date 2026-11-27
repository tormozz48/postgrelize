import type { GroupedCountResultItem } from '../find-options.ts';
import type { IncludeLoader } from '../../associations/include-loader.ts';
import type { IncludeResolver } from '../../associations/include-resolver.ts';
import { EmptyResultError, UniqueConstraintError } from '../../errors/errors.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { Transaction } from '../../transaction/transaction.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { FindQueryBuilder } from '../find-query-builder.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type {
  AnyModel,
  CreationAttributes,
  FindAndCountOptions,
  FindOptions,
  FindOrCreateOptions,
  ModelStatic,
  Values,
} from '../options.ts';
import type { RowMapper } from '../row-mapper.ts';
import type { SelectQueryBuilder } from '../select-query-builder.ts';
import type { WhereOptions } from '../types.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';
import { TransactionQueue } from './transaction-queue.ts';

const savepoints = new TransactionQueue();

/** Collaborators of `FindOperation`. */
export type FindOperationServices = OperationServices &
  Readonly<{
    /** Model state and scopes. */
    registry: ModelRegistry;
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
 * Finders of `Model` built on `findAll` / `findOne` / `count`: `findOne`, `findByPk`,
 * `findAndCountAll`, `findOrCreate` and `findOrBuild`.
 *
 * @internal
 */
export abstract class FindLookups extends ModelOperation<FindOperationServices> {
  /**
   * `Model.findOne`: `findAll` with `limit: 1` (unless given); `findAll` applies `rejectOnEmpty`.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @returns Instance or `null`.
   * @throws EmptyResultError (or the given error) with `rejectOnEmpty`.
   */
  async findOne<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOptions,
  ): Promise<M | null> {
    const [first] = await model.findAll({
      ...options,
      limit: options.limit ?? 1,
      plain: true,
    } as never);
    return first ?? null;
  }

  /**
   * Throws for an empty result when the query option, else the model option `rejectOnEmpty`, asks
   * for it (v6): an error class is instantiated, an error is thrown as it is.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @param found - Result of the finder.
   * @throws EmptyResultError or the given error.
   */
  protected rejectEmpty(model: object, options: object, found: readonly unknown[]): void {
    const reject: unknown = Object.hasOwn(options, 'rejectOnEmpty')
      ? (options as FindOptions).rejectOnEmpty
      : this.services.registry.definition(model).options.rejectOnEmpty;
    if (found.length > 0 || reject === undefined || reject === false) {
      return;
    }
    if (typeof reject === 'function') {
      throw new (reject as new () => Error)();
    }
    throw typeof reject === 'object' ? reject : new EmptyResultError();
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
    const name = this.services.registry.definition(model).primaryKeys[0] ?? 'id';
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
    options: FindAndCountOptions,
  ): Promise<Readonly<{ count: number | GroupedCountResultItem[]; rows: M[] }>> {
    const [count, rows] = await Promise.all([
      model.count({
        ...(options.where === undefined ? {} : { where: options.where }),
        ...(options.include === undefined ? {} : { include: options.include }),
        ...(options.paranoid === undefined ? {} : { paranoid: options.paranoid }),
        ...(options.distinct === undefined ? {} : { distinct: options.distinct }),
        ...(options.col === undefined ? {} : { col: options.col }),
        ...(options.group === undefined
          ? {}
          : { group: options.group as string | readonly string[] }),
        ...this.services.values.queryOptions(options),
      }),
      model.findAll(options),
    ]);
    return { count: count as number | GroupedCountResultItem[], rows };
  }

  /**
   * `Model.findOrCreate`: finds a row or creates it, both inside one transaction (v6). A lost race
   * is re-read after the rollback, so no call holds a pooled connection while waiting for another.
   * Concurrent calls in one caller transaction run one after another: their savepoints on its one
   * connection cannot interleave.
   *
   * @param model - Model class.
   * @param options - `where` to search, `defaults` to add on creation.
   * @returns `[instance, created]`.
   */
  async findOrCreate<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
  ): Promise<[M, boolean]> {
    const { transaction } = options;
    return transaction
      ? savepoints.run(transaction, () => this.#findOrCreate(model, options))
      : this.#findOrCreate(model, options);
  }

  async #findOrCreate<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
  ): Promise<[M, boolean]> {
    const { runtime } = this.services.registry.state(model);
    const outer = options.transaction ? await model.findOne(options) : null;
    if (outer !== null) {
      return [outer, false];
    }
    try {
      return await runtime.transaction(
        (transaction) => this.#findOrInsert(model, options, transaction),
        options.transaction,
      );
    } catch (error) {
      return FindLookups.#existing(model, options, error);
    }
  }

  async #findOrInsert<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
    transaction: Transaction,
  ): Promise<[M, boolean]> {
    const found = options.transaction ? null : await model.findOne({ ...options, transaction });
    if (found !== null) {
      return [found, false];
    }
    const values = {
      ...this.services.values.fromWhere(options.where),
      ...options.defaults,
    } as CreationAttributes<M>;
    const query = this.services.values.queryOptions(options);
    return [await model.create(values, { transaction, ...query }), true];
  }

  static async #existing<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
    error: unknown,
  ): Promise<[M, boolean]> {
    const existing = await model.findOne({ ...options, transaction: options.transaction ?? null });
    if (existing === null) {
      throw error;
    }
    return [existing, false];
  }

  /**
   * `Model.findCreateFind`: finds a row, otherwise creates it; when the insert fails because the
   * row appeared meanwhile (unique violation), reads the row again.
   *
   * @param model - Model class.
   * @param options - `where` to search, `defaults` to add on creation.
   * @returns `[instance, created]`.
   * @throws Error when `where` is missing.
   */
  async findCreateFind<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
  ): Promise<[M, boolean]> {
    if (options.where === undefined) {
      throw new Error('Missing where attribute in the options parameter passed to findCreateFind.');
    }
    const found = await model.findOne(options);
    if (found !== null) {
      return [found, false];
    }
    try {
      return [await this.#insert(model, options), true];
    } catch (error) {
      if (!(error instanceof UniqueConstraintError || error instanceof EmptyResultError)) {
        throw error;
      }
      return [(await model.findOne(options)) as M, false];
    }
  }

  #insert<M extends AnyModel>(model: ModelStatic<M>, options: FindOrCreateOptions): Promise<M> {
    const { registry, values } = this.services;
    const data = {
      ...values.fromWhere(options.where),
      ...options.defaults,
    } as CreationAttributes<M>;
    const create = (transaction?: Transaction): Promise<M> =>
      model.create(data, {
        ...values.queryOptions(options),
        ...(transaction === undefined ? {} : { transaction }),
      });
    // A savepoint keeps a failed insert from aborting the caller's transaction.
    return options.transaction === undefined || options.transaction === null
      ? create()
      : registry.state(model).runtime.transaction(create, options.transaction);
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
    const { values } = this.services;
    return found === null
      ? [model.build({ ...values.fromWhere(options.where), ...options.defaults } as Values), true]
      : [found, false];
  }
}
