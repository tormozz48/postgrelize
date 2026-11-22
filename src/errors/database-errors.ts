import { BaseError, type DriverError } from './base-error.ts';

/** Context attached to errors raised while executing SQL. */
export type QueryErrorContext = Readonly<{
  /** Executed SQL text. */
  sql?: string;
  /** Bound parameter values. */
  parameters?: readonly unknown[];
}>;

/**
 * Error returned by PostgreSQL while executing a query (Sequelize v6 `DatabaseError`).
 *
 * Any driver error without a more specific mapping becomes a `DatabaseError`; `sql` and `parameters` describe the failed statement and `parent.code` holds the SQLSTATE.
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.query('SELECT * FROM missing_table');
 * } catch (e) {
 *   if (e instanceof DatabaseError) {
 *     console.error(e.parent.code, e.sql, e.parameters);
 *   }
 * }
 * ```
 */
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
   * Wraps a driver error together with the statement that failed.
   *
   * @param parent - Original driver error; an empty one is substituted when omitted.
   * @param context - Executed SQL and parameters; `sql` defaults to `''` and `parameters` to `[]`.
   */
  constructor(parent: DriverError | undefined, context: QueryErrorContext = {}) {
    const driverError = parent ?? Object.assign(new Error(''), { sql: '' });
    super(driverError.message, { cause: driverError });
    this.name = 'SequelizeDatabaseError';
    this.parent = driverError;
    this.original = driverError;
    this.sql = context.sql ?? '';
    this.parameters = context.parameters ?? [];
  }
}

/**
 * A constraint that does not exist was referenced (Sequelize v6 `UnknownConstraintError`).
 *
 * @example
 * ```ts
 * try {
 *   await queryInterface.removeConstraint('users', 'missing');
 * } catch (e) {
 *   if (e instanceof UnknownConstraintError) {
 *     console.error(e.constraint, e.table);
 *   }
 * }
 * ```
 */
export class UnknownConstraintError extends DatabaseError {
  /** Constraint name. */
  readonly constraint: string | undefined;
  /** Constraint columns. */
  readonly fields: Readonly<Record<string, unknown>> | undefined;
  /** Table name. */
  readonly table: string | undefined;

  /**
   * Builds the error; `message` defaults to v6's "The specified constraint does not exist".
   *
   * @param options - Constraint details and an optional driver error.
   */
  constructor(
    options: Readonly<{
      message?: string;
      constraint?: string;
      fields?: Readonly<Record<string, unknown>>;
      table?: string;
      parent?: DriverError;
    }> = {},
  ) {
    super(options.parent);
    this.name = 'SequelizeUnknownConstraintError';
    this.message = options.message ?? 'The specified constraint does not exist';
    this.constraint = options.constraint;
    this.fields = options.fields;
    this.table = options.table;
  }
}

/**
 * Query cancelled by PostgreSQL, e.g. because `statement_timeout` elapsed (SQLSTATE `57014`).
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.query('SELECT pg_sleep(10)');
 * } catch (e) {
 *   if (e instanceof TimeoutError) {
 *     console.error('query was cancelled:', e.sql);
 *   }
 * }
 * ```
 */
export class TimeoutError extends DatabaseError {
  /**
   * Wraps a driver error together with the statement that failed.
   *
   * @param parent - Original driver error.
   * @param context - Executed SQL and parameters.
   */
  constructor(parent: DriverError, context?: QueryErrorContext) {
    super(parent, context);
    this.name = 'SequelizeTimeoutError';
  }
}

/**
 * Input of the constraint error constructors: the driver error plus what PostgreSQL reported about the constraint.
 *
 * @example
 * ```ts
 * const options: ConstraintErrorOptions = {
 *   parent: Object.assign(new Error('violates foreign key constraint'), { code: '23503' }),
 *   fields: ['userId'],
 *   table: 'posts',
 *   constraint: 'posts_userId_fkey',
 *   sql: 'INSERT INTO "posts" ("userId") VALUES ($1)',
 *   parameters: [42],
 * };
 * const error = new ForeignKeyConstraintError(options);
 * ```
 */
export type ConstraintErrorOptions = QueryErrorContext &
  Readonly<{
    /** Original driver error; an empty one is substituted when omitted. */
    parent?: DriverError;
    /** Constraint columns mapped to offending values. */
    fields?: Readonly<Record<string, string>> | readonly string[];
    /** Table name. */
    table?: string;
    /** Constraint name. */
    constraint?: string;
    /** Error message, defaults to the driver message. */
    message?: string;
  }>;

/**
 * Thrown when a write references a missing row or removes a row that is still referenced (SQLSTATE `23503`).
 *
 * `fields` lists the referencing columns (parsed from the PostgreSQL detail), `table` the table and `index` the constraint name.
 *
 * @example
 * ```ts
 * try {
 *   await Post.create({ title: 'Hello', userId: 999999 });
 * } catch (e) {
 *   if (e instanceof ForeignKeyConstraintError) {
 *     console.error(e.table, e.fields, e.index);
 *   }
 * }
 * ```
 */
export class ForeignKeyConstraintError extends DatabaseError {
  /** Referencing columns. */
  readonly fields: readonly string[];
  /** Table name. */
  readonly table: string | undefined;
  /** Constraint name. */
  readonly index: string | undefined;

  /**
   * Builds the error from the constraint details; an object `fields` is reduced to its keys.
   *
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

/**
 * Thrown when a row conflicts with an exclusion constraint, e.g. overlapping ranges (SQLSTATE `23P01`). PostgreSQL-specific; v6 has no such class.
 *
 * `constraint` is the constraint name, `fields` the columns parsed from the PostgreSQL detail and `table` the table.
 *
 * @example
 * ```ts
 * try {
 *   await Task.create({ room: 'A', during: [new Date('2026-01-01'), new Date('2026-01-02')] });
 * } catch (e) {
 *   if (e instanceof ExclusionConstraintError) {
 *     console.error(e.constraint, e.fields);
 *   }
 * }
 * ```
 */
export class ExclusionConstraintError extends DatabaseError {
  /** Constraint name. */
  readonly constraint: string | undefined;
  /** Constraint columns. */
  readonly fields: readonly string[];
  /** Table name. */
  readonly table: string | undefined;

  /**
   * Builds the error from the constraint details; an object `fields` is reduced to its keys.
   *
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
