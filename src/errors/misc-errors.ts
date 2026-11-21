import { BaseError } from './base-error.ts';

/**
 * Thrown when saving an instance of a model with `version: true` updates no row because another writer changed it first (optimistic locking).
 *
 * The failed update is not retried; reload the instance and apply the change again.
 *
 * @example
 * ```ts
 * const user = await User.findByPk(1);
 * try {
 *   await user!.update({ name: 'New name' });
 * } catch (e) {
 *   if (e instanceof OptimisticLockError) {
 *     console.error(e.modelName, e.where);
 *   }
 * }
 * ```
 */
export class OptimisticLockError extends BaseError {
  /** Name of the model whose row was stale; `undefined` when not given. */
  readonly modelName: string | undefined;
  /** Primary key values of the row. */
  readonly where: unknown;
  /** Expected version values. */
  readonly values: unknown;

  /**
   * Builds the error; the message defaults to `Attempting to update a stale model instance: <modelName>`.
   *
   * @param options - Model name, values and where of the failed update.
   */
  constructor(
    options: Readonly<{
      message?: string;
      modelName?: string;
      values?: unknown;
      where?: unknown;
    }> = {},
  ) {
    super(
      options.message ?? `Attempting to update a stale model instance: ${options.modelName ?? ''}`,
    );
    this.name = 'SequelizeOptimisticLockError';
    this.modelName = options.modelName;
    this.values = options.values;
    this.where = options.where;
  }
}

/**
 * Failure of one record in a bulk operation, carrying the offending record.
 *
 * Collected into an {@link AggregateError} by `bulkCreate` with `validate: true`.
 *
 * @example
 * ```ts
 * try {
 *   await User.bulkCreate([{ email: 'not-an-email' }], { validate: true });
 * } catch (e) {
 *   if (e instanceof AggregateError) {
 *     for (const item of e.errors) {
 *       if (item instanceof BulkRecordError) {
 *         console.error(item.record, item.errors.message);
 *       }
 *     }
 *   }
 * }
 * ```
 */
export class BulkRecordError extends BaseError {
  /** Underlying error. */
  readonly errors: Error;
  /** Record that failed. */
  readonly record: object;

  /**
   * Wraps the validation error of one record; the message is copied from it.
   *
   * @param error - Underlying error.
   * @param record - Record that failed.
   */
  constructor(error: Error, record: object) {
    super(error.message);
    this.name = 'SequelizeBulkRecordError';
    this.errors = error;
    this.record = record;
  }
}

/**
 * Bundles the errors of one bulk operation into a single error (Sequelize v6 `AggregateError`).
 *
 * `bulkCreate` with `validate: true` validates every record and throws this error with one {@link BulkRecordError} per invalid record. The message joins the messages of all errors with newlines.
 *
 * @example
 * ```ts
 * try {
 *   await User.bulkCreate([{ email: 'a' }, { email: 'b' }], { validate: true });
 * } catch (e) {
 *   if (e instanceof AggregateError) {
 *     console.error(`${e.errors.length} records failed`);
 *   }
 * }
 * ```
 */
export class AggregateError extends BaseError {
  /** Collected errors. */
  readonly errors: readonly Error[];

  /**
   * Creates the error from the collected errors.
   *
   * @param errors - Collected errors.
   */
  constructor(errors: readonly Error[]) {
    super(errors.map((error) => error.message).join('\n'));
    this.name = 'AggregateError';
    this.errors = errors;
  }
}

/**
 * Thrown by finders called with `rejectOnEmpty: true` when no row matches.
 *
 * Pass an `Error` instance as `rejectOnEmpty` to throw it instead of this class.
 *
 * @example
 * ```ts
 * try {
 *   await User.findOne({ where: { email: 'nobody@example.com' }, rejectOnEmpty: true });
 * } catch (e) {
 *   if (e instanceof EmptyResultError) {
 *     console.error('no such user');
 *   }
 * }
 * ```
 */
export class EmptyResultError extends BaseError {
  /**
   * Creates the error.
   *
   * @param message - Error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'SequelizeEmptyResultError';
  }
}

/**
 * Thrown when an instance method is used on an instance in the wrong state, e.g. `reload()` for a row that no longer exists.
 *
 * @example
 * ```ts
 * try {
 *   await user.destroy();
 *   await user.reload();
 * } catch (e) {
 *   if (e instanceof InstanceError) {
 *     console.error(e.message);
 *   }
 * }
 * ```
 */
export class InstanceError extends BaseError {
  /**
   * Creates the error.
   *
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'SequelizeInstanceError';
  }
}

/**
 * Thrown when an `include` names a model that is not associated with the queried model.
 *
 * @example
 * ```ts
 * try {
 *   await User.findAll({ include: [Tag] });
 * } catch (e) {
 *   if (e instanceof EagerLoadingError) {
 *     console.error(e.message);
 *   }
 * }
 * ```
 */
export class EagerLoadingError extends BaseError {
  /**
   * Creates the error.
   *
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'SequelizeEagerLoadingError';
  }
}

/**
 * Thrown when an association is defined incorrectly, e.g. two associations of one model share an alias.
 *
 * @example
 * ```ts
 * try {
 *   User.hasMany(Post, { as: 'items' });
 *   User.hasMany(Task, { as: 'items' });
 * } catch (e) {
 *   if (e instanceof AssociationError) {
 *     console.error(e.message);
 *   }
 * }
 * ```
 */
export class AssociationError extends BaseError {
  /**
   * Creates the error.
   *
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'SequelizeAssociationError';
  }
}

/**
 * Base class of query construction errors (Sequelize v6 `QueryError`); postgrelize does not throw it itself.
 *
 * @example
 * ```ts
 * try {
 *   await User.findAll();
 * } catch (e) {
 *   if (e instanceof QueryError) {
 *     console.error(e.message);
 *   }
 * }
 * ```
 */
export class QueryError extends BaseError {
  /**
   * Creates the error and sets `name` to `'SequelizeQueryError'`.
   *
   * @param message - Error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'SequelizeQueryError';
  }
}

/**
 * Thrown for an invalid scope definition or use (Sequelize v6 `SequelizeScopeError`).
 *
 * @example
 * ```ts
 * try {
 *   User.scope('missing');
 * } catch (e) {
 *   if (e instanceof SequelizeScopeError) {
 *     console.error(e.message);
 *   }
 * }
 * ```
 */
export class SequelizeScopeError extends BaseError {
  /**
   * Creates the error and sets `name` to `'SequelizeScopeError'`.
   *
   * @param message - Error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'SequelizeScopeError';
  }
}
