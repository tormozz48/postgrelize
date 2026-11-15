/**
 * Effect API of postgrelize (`postgrelize/effect`): model operations, raw queries and transactions as
 * [Effect](https://effect.website) programs. Failures are the Sequelize v6 error classes
 * (`DatabaseError`, `UniqueConstraintError`, `ValidationError`, ...); anything else is a defect.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import * as Db from 'postgrelize/effect';
 *
 * const program = Db.transaction(sequelize, (transaction) =>
 *   Effect.gen(function* () {
 *     const user = yield* Db.create(User, { email: 'ann@example.com' }, { transaction });
 *     yield* Db.update(Account, { owner: user.id }, { where: { id: 1 }, transaction });
 *     return user;
 *   }),
 * );
 * ```
 *
 * @module
 */
import { Effect, Exit } from 'effect';
import { BaseError, EmptyResultError } from '../errors/errors.ts';
import { countProgram, findAllProgram } from '../model/model.ts';
import type {
  AnyModel,
  Attributes,
  BulkCreateOptions,
  CountOptions,
  CreateOptions,
  CreationAttributes,
  DestroyOptions,
  FindOptions,
  InsertOptions,
  ModelStatic,
  UpdateOptions,
  UpsertOptions,
} from '../model/options.ts';
import type { Sequelize } from '../sequelize.ts';
import type { Transaction, TransactionOptions } from '../transaction/transaction.ts';

/** Failures of postgrelize programs: the Sequelize v6 error classes. */
export type PostgrelizeError = BaseError;

const typed = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, PostgrelizeError> =>
  effect.pipe(
    Effect.catch((error) => (error instanceof BaseError ? Effect.fail(error) : Effect.die(error))),
  );

const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, PostgrelizeError> =>
  typed(Effect.tryPromise({ try: run, catch: (error) => error }));

/**
 * `Model.findAll` as an Effect.
 *
 * @param model - Model class.
 * @param options - Find options.
 * @returns Program yielding the instances.
 */
export const findAll = <M extends AnyModel>(
  model: ModelStatic<M>,
  options?: FindOptions<Attributes<M>>,
): Effect.Effect<M[], PostgrelizeError> => typed(findAllProgram(model, options));

/**
 * `Model.findOne` as an Effect.
 *
 * @param model - Model class.
 * @param options - Find options.
 * @returns Program yielding the instance or `null`.
 */
export const findOne = <M extends AnyModel>(
  model: ModelStatic<M>,
  options?: FindOptions<Attributes<M>>,
): Effect.Effect<M | null, PostgrelizeError> =>
  findAll(model, { ...options, limit: options?.limit ?? 1 }).pipe(
    Effect.flatMap(([first]) =>
      first === undefined && options?.rejectOnEmpty !== undefined && options.rejectOnEmpty !== false
        ? typed(
            Effect.fail(
              options.rejectOnEmpty instanceof Error
                ? options.rejectOnEmpty
                : new EmptyResultError(),
            ),
          )
        : Effect.succeed(first ?? null),
    ),
  );

/**
 * `Model.findByPk` as an Effect.
 *
 * @param model - Model class.
 * @param key - Primary key value.
 * @param options - Find options without `where`.
 * @returns Program yielding the instance or `null`.
 */
export const findByPk = <M extends AnyModel>(
  model: ModelStatic<M>,
  key: unknown,
  options?: Omit<FindOptions<Attributes<M>>, 'where'>,
): Effect.Effect<M | null, PostgrelizeError> =>
  key === null || key === undefined
    ? Effect.succeed(null)
    : findOne(model, {
        ...options,
        where: { [model.primaryKeyAttributes[0] ?? 'id']: key },
      } as FindOptions<Attributes<M>>);

/**
 * `Model.count` as an Effect.
 *
 * @param model - Model class.
 * @param options - Count options.
 * @returns Program yielding the count.
 */
export const count = <M extends AnyModel>(
  model: ModelStatic<M>,
  options?: CountOptions<Attributes<M>>,
): Effect.Effect<number, PostgrelizeError> => typed(countProgram(model, options));

/**
 * `Model.create` as an Effect.
 *
 * @param model - Model class.
 * @param values - Attribute values.
 * @param options - Create options.
 * @returns Program yielding the saved instance.
 */
export const create = <M extends AnyModel>(
  model: ModelStatic<M>,
  values: CreationAttributes<M>,
  options?: CreateOptions<Attributes<M>>,
): Effect.Effect<M, PostgrelizeError> => attempt(() => model.create(values, options));

/**
 * `Model.bulkCreate` as an Effect.
 *
 * @param model - Model class.
 * @param records - Attribute values per row.
 * @param options - Bulk create options.
 * @returns Program yielding the instances.
 */
export const bulkCreate = <M extends AnyModel>(
  model: ModelStatic<M>,
  records: readonly CreationAttributes<M>[],
  options?: BulkCreateOptions<Attributes<M>>,
): Effect.Effect<M[], PostgrelizeError> => attempt(() => model.bulkCreate(records, options));

/**
 * `Model.insert` (PostgreSQL extension, `onConflict` with `wasInserted`) as an Effect.
 *
 * @param model - Model class.
 * @param values - One row or several rows.
 * @param options - Insert options.
 * @returns Program yielding the written instances.
 */
export const insert = <M extends AnyModel>(
  model: ModelStatic<M>,
  values: CreationAttributes<M> | readonly CreationAttributes<M>[],
  options?: InsertOptions<Attributes<M>>,
): Effect.Effect<M[], PostgrelizeError> => attempt(() => model.insert(values, options));

/**
 * `Model.upsert` as an Effect.
 *
 * @param model - Model class.
 * @param values - Attribute values.
 * @param options - Upsert options.
 * @returns Program yielding `[instance, created]` (`created` is `null` without `onConflict`).
 */
export const upsert = <M extends AnyModel>(
  model: ModelStatic<M>,
  values: CreationAttributes<M>,
  options?: UpsertOptions<Attributes<M>>,
): Effect.Effect<[M, boolean | null], PostgrelizeError> =>
  attempt(() => model.upsert(values, options));

/**
 * Static `Model.update` as an Effect.
 *
 * @param model - Model class.
 * @param values - New values.
 * @param options - Update options (`where` is required).
 * @returns Program yielding `[affectedCount]`, or `[affectedCount, rows]` with `returning: true`.
 */
export const update = <M extends AnyModel>(
  model: ModelStatic<M>,
  values: Partial<Attributes<M>>,
  options: UpdateOptions<Attributes<M>>,
): Effect.Effect<[affectedCount: number, affectedRows?: M[]], PostgrelizeError> =>
  attempt(() => model.update(values, options));

/**
 * Static `Model.destroy` as an Effect.
 *
 * @param model - Model class.
 * @param options - Destroy options.
 * @returns Program yielding the number of deleted rows.
 */
export const destroy = <M extends AnyModel>(
  model: ModelStatic<M>,
  options?: DestroyOptions<Attributes<M>>,
): Effect.Effect<number, PostgrelizeError> => attempt(() => model.destroy(options));

/**
 * `sequelize.query` as an Effect.
 *
 * @param sequelize - Sequelize instance.
 * @param sql - SQL text.
 * @param options - Query options (`type`, `replacements`, `bind`, `transaction`, ...).
 * @returns Program yielding the query result.
 */
export const query = (
  sequelize: Sequelize,
  sql: string,
  options?: Parameters<Sequelize['query']>[1],
): Effect.Effect<unknown, PostgrelizeError> => attempt(() => sequelize.query(sql, options));

/**
 * Runs `use` in a transaction: commits when it succeeds, rolls back when it fails or is interrupted.
 * Pass the transaction to every operation (`{ transaction }`); CLS does not follow Effect fibers.
 *
 * @param sequelize - Sequelize instance.
 * @param use - Program using the transaction.
 * @param options - Transaction options (isolation level, `settings`, parent `transaction`, ...).
 * @returns Program yielding the result of `use`.
 */
export const transaction = <A, E>(
  sequelize: Sequelize,
  use: (transaction: Transaction) => Effect.Effect<A, E>,
  options: TransactionOptions = {},
): Effect.Effect<A, E | PostgrelizeError> =>
  Effect.acquireUseRelease(
    attempt(() => sequelize.transaction(options)),
    (started) => use(started).pipe(Effect.tap(() => typed(started.commitEffect()))),
    (started, exit) =>
      Exit.isFailure(exit) && started.finished === undefined
        ? Effect.asVoid(Effect.exit(started.rollbackEffect()))
        : Effect.void,
  );
