/** Driver error object as produced by `pg` (a subset of its fields). */
export type DriverError = Error &
  Readonly<{
    code?: string;
    detail?: string;
    table?: string;
    constraint?: string;
    schema?: string;
    column?: string;
  }>;

/** Base class of all postgrelize errors (Sequelize v6 `BaseError`). */
export class BaseError extends Error {
  /**
   * @param message - Error message.
   * @param options - Standard error options (`cause`).
   */
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SequelizeBaseError';
  }
}

/** Origin of a validation error item. */
export type ValidationErrorItemOrigin = 'CORE' | 'DB' | 'FUNCTION';

/** One failed validation (Sequelize v6 `ValidationErrorItem`). */
export class ValidationErrorItem {
  /** Human-readable message. */
  readonly message: string;
  /** Validation type, e.g. `'unique violation'`, `'notNull Violation'`. */
  readonly type: string | null;
  /** Attribute name. */
  readonly path: string | null;
  /** Offending value. */
  readonly value: string | null;
  /** Where the error was raised. */
  readonly origin: ValidationErrorItemOrigin | null;
  /** Validator key, e.g. `'not_unique'`. */
  readonly validatorKey: string | null;

  /**
   * @param message - Human-readable message.
   * @param type - Validation type.
   * @param path - Attribute name.
   * @param value - Offending value.
   * @param origin - Where the error was raised.
   * @param validatorKey - Validator key.
   */
  constructor(
    message: string,
    type: string | null = null,
    path: string | null = null,
    value: string | null = null,
    origin: ValidationErrorItemOrigin | null = null,
    validatorKey: string | null = null,
  ) {
    this.message = message;
    this.type = type;
    this.path = path;
    this.value = value;
    this.origin = origin;
    this.validatorKey = validatorKey;
  }
}

/** Validation failure with one or more items (Sequelize v6 `ValidationError`). */
export class ValidationError extends BaseError {
  /** Individual validation failures. */
  readonly errors: readonly ValidationErrorItem[];

  /**
   * @param message - Error message.
   * @param errors - Individual validation failures.
   */
  constructor(message: string, errors: readonly ValidationErrorItem[] = []) {
    super(message);
    this.name = 'SequelizeValidationError';
    this.errors = errors;
  }
}

/** Context attached to errors raised while executing SQL. */
export type QueryErrorContext = Readonly<{
  /** Executed SQL text. */
  sql?: string;
  /** Bound parameter values. */
  parameters?: readonly unknown[];
}>;

/** Error returned by PostgreSQL while executing a query (Sequelize v6 `DatabaseError`). */
export class DatabaseError extends BaseError {
  /** Original driver error. */
  readonly parent: DriverError;
  /** Original driver error (alias of `parent`). */
  readonly original: DriverError;
  /** Executed SQL text. */
  readonly sql: string;
  /** Bound parameter values. */
  readonly parameters: readonly unknown[];

  /**
   * @param parent - Original driver error.
   * @param context - Executed SQL and parameters.
   */
  constructor(parent: DriverError, context: QueryErrorContext = {}) {
    super(parent.message, { cause: parent });
    this.name = 'SequelizeDatabaseError';
    this.parent = parent;
    this.original = parent;
    this.sql = context.sql ?? '';
    this.parameters = context.parameters ?? [];
  }
}

/** Query cancelled because of a timeout (`57014`). */
export class TimeoutError extends DatabaseError {
  /**
   * @param parent - Original driver error.
   * @param context - Executed SQL and parameters.
   */
  constructor(parent: DriverError, context?: QueryErrorContext) {
    super(parent, context);
    this.name = 'SequelizeTimeoutError';
  }
}

/** Fields and context of a constraint violation. */
export type ConstraintErrorOptions = QueryErrorContext &
  Readonly<{
    /** Original driver error. */
    parent: DriverError;
    /** Constraint columns mapped to offending values. */
    fields?: Readonly<Record<string, string>> | readonly string[];
    /** Table name. */
    table?: string;
    /** Constraint name. */
    constraint?: string;
    /** Error message, defaults to the driver message. */
    message?: string;
  }>;

/** Unique constraint violation (`23505`), Sequelize v6 `UniqueConstraintError`. */
export class UniqueConstraintError extends ValidationError {
  /** Original driver error. */
  readonly parent: DriverError;
  /** Original driver error (alias of `parent`). */
  readonly original: DriverError;
  /** Executed SQL text. */
  readonly sql: string;
  /** Unique columns mapped to offending values. */
  readonly fields: Readonly<Record<string, string>>;

  /**
   * @param options - Driver error, fields and validation items.
   */
  constructor(
    options: Omit<ConstraintErrorOptions, 'fields'> &
      Readonly<{
        fields?: Readonly<Record<string, string>>;
        errors?: readonly ValidationErrorItem[];
      }>,
  ) {
    super(options.message ?? 'Validation error', options.errors);
    this.name = 'SequelizeUniqueConstraintError';
    this.parent = options.parent;
    this.original = options.parent;
    this.sql = options.sql ?? '';
    this.fields = options.fields ?? {};
  }
}

/** Foreign key constraint violation (`23503`). */
export class ForeignKeyConstraintError extends DatabaseError {
  /** Referencing columns. */
  readonly fields: readonly string[];
  /** Table name. */
  readonly table: string | undefined;
  /** Constraint name. */
  readonly index: string | undefined;

  /**
   * @param options - Driver error, fields and context.
   */
  constructor(options: ConstraintErrorOptions) {
    super(options.parent, options);
    this.name = 'SequelizeForeignKeyConstraintError';
    this.fields = Array.isArray(options.fields)
      ? options.fields
      : Object.keys(options.fields ?? {});
    this.table = options.table;
    this.index = options.constraint;
  }
}

/** Exclusion constraint violation (`23P01`). */
export class ExclusionConstraintError extends DatabaseError {
  /** Constraint name. */
  readonly constraint: string | undefined;
  /** Constraint columns. */
  readonly fields: readonly string[];
  /** Table name. */
  readonly table: string | undefined;

  /**
   * @param options - Driver error, fields and context.
   */
  constructor(options: ConstraintErrorOptions) {
    super(options.parent, options);
    this.name = 'SequelizeExclusionConstraintError';
    this.constraint = options.constraint;
    this.fields = Array.isArray(options.fields)
      ? options.fields
      : Object.keys(options.fields ?? {});
    this.table = options.table;
  }
}

/** Connection-level failure (Sequelize v6 `ConnectionError`). */
export class ConnectionError extends BaseError {
  /** Original driver error. */
  readonly parent: Error;
  /** Original driver error (alias of `parent`). */
  readonly original: Error;

  /**
   * @param parent - Original driver error.
   */
  constructor(parent: Error) {
    super(parent.message, { cause: parent });
    this.name = 'SequelizeConnectionError';
    this.parent = parent;
    this.original = parent;
  }
}

const connectionError = (name: string): typeof ConnectionError =>
  class extends ConnectionError {
    constructor(parent: Error) {
      super(parent);
      this.name = name;
    }
  };

/** The server refused the connection (`ECONNREFUSED`). */
export class ConnectionRefusedError extends connectionError('SequelizeConnectionRefusedError') {}
/** Authentication failed (`28P01`, `28000`). */
export class AccessDeniedError extends connectionError('SequelizeAccessDeniedError') {}
/** Host name could not be resolved (`ENOTFOUND`). */
export class HostNotFoundError extends connectionError('SequelizeHostNotFoundError') {}
/** Host is unreachable (`EHOSTUNREACH`). */
export class HostNotReachableError extends connectionError('SequelizeHostNotReachableError') {}
/** Invalid connection parameters (`EINVAL`). */
export class InvalidConnectionError extends connectionError('SequelizeInvalidConnectionError') {}
/** Connecting timed out (`ETIMEDOUT`). */
export class ConnectionTimedOutError extends connectionError('SequelizeConnectionTimedOutError') {}
/** No connection became available in the pool within `pool.acquire` ms. */
export class ConnectionAcquireTimeoutError extends connectionError(
  'SequelizeConnectionAcquireTimeoutError',
) {}

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
