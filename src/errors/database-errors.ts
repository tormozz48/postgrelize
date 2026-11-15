import { BaseError, type DriverError } from './base-error.ts';

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
