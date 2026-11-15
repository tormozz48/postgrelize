import { BaseError } from './base-error.ts';

/** A row could not be updated because its version changed (optimistic locking). */
export class OptimisticLockError extends BaseError {
  /** Model name. */
  readonly modelName: string | undefined;
  /** Primary key values of the row. */
  readonly where: unknown;
  /** Expected version values. */
  readonly values: unknown;

  /**
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

/** Error of one record in a bulk operation. */
export class BulkRecordError extends BaseError {
  /** Underlying error. */
  readonly errors: Error;
  /** Record that failed. */
  readonly record: object;

  /**
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

/** Several errors raised by one bulk operation (Sequelize v6 `AggregateError`). */
export class AggregateError extends BaseError {
  /** Collected errors. */
  readonly errors: readonly Error[];

  /**
   * @param errors - Collected errors.
   */
  constructor(errors: readonly Error[]) {
    super(errors.map((error) => error.message).join('\n'));
    this.name = 'AggregateError';
    this.errors = errors;
  }
}

/** `rejectOnEmpty` was set and no row was found. */
export class EmptyResultError extends BaseError {
  /**
   * @param message - Error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'SequelizeEmptyResultError';
  }
}

/** Instance-level misuse, e.g. reloading an unsaved instance. */
export class InstanceError extends BaseError {
  /**
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'SequelizeInstanceError';
  }
}

/** Invalid `include` (unknown or ambiguous association). */
export class EagerLoadingError extends BaseError {
  /**
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'SequelizeEagerLoadingError';
  }
}

/** Invalid association definition. */
export class AssociationError extends BaseError {
  /**
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'SequelizeAssociationError';
  }
}
