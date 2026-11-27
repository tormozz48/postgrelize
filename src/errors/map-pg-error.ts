import {
  AccessDeniedError,
  BaseError,
  ConnectionError,
  ConnectionRefusedError,
  ConnectionTimedOutError,
  DatabaseError,
  ExclusionConstraintError,
  ForeignKeyConstraintError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
  TimeoutError,
  UniqueConstraintError,
  UnknownConstraintError,
  ValidationErrorItem,
  type DriverError,
  type QueryErrorContext,
} from './errors.ts';

const KEY_DETAIL = /Key \((.*?)\)=\((.*?)\)/;

const CONNECTION_CODES: ReadonlyMap<string, new (parent: Error) => ConnectionError> = new Map<
  string,
  new (parent: Error) => ConnectionError
>([
  ['ECONNREFUSED', ConnectionRefusedError],
  ['ENOTFOUND', HostNotFoundError],
  ['EAI_AGAIN', HostNotFoundError],
  ['EHOSTUNREACH', HostNotReachableError],
  ['EINVAL', InvalidConnectionError],
  ['ETIMEDOUT', ConnectionTimedOutError],
  ['28P01', AccessDeniedError],
  ['28000', AccessDeniedError],
]);

/** Maps `pg` driver errors to the matching Sequelize v6 error classes. */
export class PgErrorMapper {
  /**
   * Parses `Key (a, b)=(1, 2)` from a PostgreSQL error detail into `{ a: '1', b: '2' }`.
   *
   * @param detail - `detail` of the driver error.
   * @returns Key values by column, or `undefined` when the detail has no key.
   */
  parseKeyDetail(detail: string | undefined): Readonly<Record<string, string>> | undefined {
    const match = detail === undefined ? null : KEY_DETAIL.exec(detail);
    if (match === null) {
      return undefined;
    }
    const keys = PgErrorMapper.#splitList(match[1] ?? '');
    const values = PgErrorMapper.#splitList(match[2] ?? '');
    return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? '']));
  }

  /**
   * Maps a `pg` error raised by a query to the matching Sequelize v6 error class.
   *
   * @param error - Error thrown by the driver.
   * @param context - SQL and parameters of the failed query.
   * @returns Sequelize error (the error itself when it already is one).
   */
  mapQueryError(error: unknown, context: QueryErrorContext = {}): BaseError {
    if (error instanceof BaseError) {
      return error;
    }
    const driverError: DriverError = error instanceof Error ? error : new Error(String(error));
    switch (driverError.code) {
      case '23505':
        return this.#uniqueViolation(driverError, context);
      case '23503':
        return new ForeignKeyConstraintError(this.#constraintOptions(driverError, context));
      case '23P01':
        return new ExclusionConstraintError(this.#constraintOptions(driverError, context));
      case '57014':
        return new TimeoutError(driverError, context);
      default:
        return PgErrorMapper.#isConnectionFailure(driverError)
          ? this.mapConnectionError(driverError)
          : this.#databaseError(driverError, context);
    }
  }

  /**
   * Maps an error raised while connecting to the matching Sequelize v6 connection error class.
   *
   * @param error - Error thrown by the driver.
   * @returns Connection error (the error itself when it already is one).
   */
  mapConnectionError(error: unknown): ConnectionError {
    if (error instanceof ConnectionError) {
      return error;
    }
    const driverError: DriverError = error instanceof Error ? error : new Error(String(error));
    const ErrorClass =
      (driverError.code === undefined ? undefined : CONNECTION_CODES.get(driverError.code)) ??
      ConnectionError;
    return new ErrorClass(driverError);
  }

  #uniqueViolation(error: DriverError, context: QueryErrorContext): UniqueConstraintError {
    const fields = this.parseKeyDetail(error.detail);
    const base = { parent: error, ...context, ...PgErrorMapper.#tableAndConstraint(error) };
    return fields === undefined
      ? new UniqueConstraintError({ ...base, message: error.message })
      : new UniqueConstraintError({ ...base, fields, errors: PgErrorMapper.#uniqueItems(fields) });
  }

  // like v6, "undefined object" of a statement about a constraint or index has its own class
  #databaseError(error: DriverError, context: QueryErrorContext): DatabaseError {
    if (error.code !== '42704' || !/CONSTRAINT|INDEX/i.test(context.sql ?? '')) {
      return new DatabaseError(error, context);
    }
    const constraint = /(?:constraint|index) "(.+?)"/i.exec(error.message)?.[1];
    const table = /relation "(.+?)"/i.exec(error.message)?.[1];
    return new UnknownConstraintError({
      message: 'Unknown constraint error',
      parent: error,
      ...(constraint === undefined ? {} : { constraint }),
      ...(table === undefined ? {} : { table }),
    });
  }

  #constraintOptions(error: DriverError, context: QueryErrorContext) {
    return {
      parent: error,
      ...context,
      fields: Object.keys(this.parseKeyDetail(error.detail) ?? {}),
      ...PgErrorMapper.#tableAndConstraint(error),
    };
  }

  static #tableAndConstraint(error: DriverError): { table?: string; constraint?: string } {
    return {
      ...(error.table === undefined ? {} : { table: error.table }),
      ...(error.constraint === undefined ? {} : { constraint: error.constraint }),
    };
  }

  static #uniqueItems(fields: Readonly<Record<string, string>>): ValidationErrorItem[] {
    return Object.entries(fields).map(
      ([field, value]) =>
        new ValidationErrorItem(
          `${field} must be unique`,
          'unique violation',
          field,
          value,
          null,
          'not_unique',
        ),
    );
  }

  static #splitList(value: string): readonly string[] {
    return value.split(',').map((part) => part.trim().replace(/^"(.*)"$/, '$1'));
  }

  static #isConnectionFailure(error: DriverError): boolean {
    return (
      error.code !== undefined && (CONNECTION_CODES.has(error.code) || error.code.startsWith('08'))
    );
  }
}
