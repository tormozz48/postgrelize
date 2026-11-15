import type { IncludeLoader } from '../../associations/include-loader.ts';
import type { IncludeResolver } from '../../associations/include-resolver.ts';
import { EmptyResultError } from '../../errors/errors.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { Transaction } from '../../transaction/transaction.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { FindQueryBuilder } from '../find-query-builder.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type {
  AnyModel,
  CreationAttributes,
  FindOptions,
  FindOrCreateOptions,
  ModelStatic,
  Values,
} from '../options.ts';
import type { RowMapper } from '../row-mapper.ts';
import type { SelectQueryBuilder } from '../select-query-builder.ts';
import type { WhereOptions } from '../types.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';

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
    options: FindOptions,
  ): Promise<Readonly<{ count: number; rows: M[] }>> {
    const [count, rows] = await Promise.all([
      model.count({
        ...(options.where === undefined ? {} : { where: options.where }),
        ...(options.include === undefined ? {} : { include: options.include }),
        ...(options.paranoid === undefined ? {} : { paranoid: options.paranoid }),
        ...this.services.values.queryOptions(options),
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
    const { runtime } = this.services.registry.state(model);
    const found = await model.findOne(options);
    if (found !== null) {
      return [found, false];
    }
    return runtime.transaction(
      (transaction) => this.#create(model, options, transaction),
      options.transaction,
    );
  }

  async #create<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOrCreateOptions,
    transaction: Transaction,
  ): Promise<[M, boolean]> {
    const values = {
      ...this.services.values.fromWhere(options.where),
      ...options.defaults,
    } as CreationAttributes<M>;
    try {
      return [
        await model.create(values, { transaction, ...this.services.values.queryOptions(options) }),
        true,
      ];
    } catch (error) {
      return FindLookups.#existing(model, options, error);
    }
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
