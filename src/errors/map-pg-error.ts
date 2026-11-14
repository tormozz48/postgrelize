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
  ValidationErrorItem,
  type DriverError,
  type QueryErrorContext,
} from './errors.ts';

const KEY_DETAIL = /Key \((.*?)\)=\((.*?)\)/;

const splitList = (value: string): readonly string[] =>
  value.split(',').map((part) => part.trim().replace(/^"(.*)"$/, '$1'));

/** Parses `Key (a, b)=(1, 2)` from a PostgreSQL error detail into `{ a: '1', b: '2' }`. */
export const parseKeyDetail = (
  detail: string | undefined,
): Readonly<Record<string, string>> | undefined => {
  const match = detail === undefined ? null : KEY_DETAIL.exec(detail);
  if (match === null) {
    return undefined;
  }
  const keys = splitList(match[1] ?? '');
  const values = splitList(match[2] ?? '');
  return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? '']));
};

const uniqueViolation = (error: DriverError, context: QueryErrorContext): UniqueConstraintError => {
  const fields = parseKeyDetail(error.detail);
  const base = {
    parent: error,
    ...context,
    ...(error.table === undefined ? {} : { table: error.table }),
    ...(error.constraint === undefined ? {} : { constraint: error.constraint }),
  };
  return fields === undefined
    ? new UniqueConstraintError({ ...base, message: error.message })
    : new UniqueConstraintError({
        ...base,
        fields,
        errors: Object.entries(fields).map(
          ([field, value]) =>
            new ValidationErrorItem(
              `${field} must be unique`,
              'unique violation',
              field,
              value,
              null,
              'not_unique',
            ),
        ),
      });
};

const constraintOptions = (error: DriverError, context: QueryErrorContext) => ({
  parent: error,
  ...context,
  fields: Object.keys(parseKeyDetail(error.detail) ?? {}),
  ...(error.table === undefined ? {} : { table: error.table }),
  ...(error.constraint === undefined ? {} : { constraint: error.constraint }),
});

/** Maps a `pg` error raised by a query to the matching Sequelize v6 error class. */
export const mapQueryError = (error: unknown, context: QueryErrorContext = {}): BaseError => {
  if (error instanceof BaseError) {
    return error;
  }
  const driverError: DriverError = error instanceof Error ? error : new Error(String(error));
  switch (driverError.code) {
    case '23505':
      return uniqueViolation(driverError, context);
    case '23503':
      return new ForeignKeyConstraintError(constraintOptions(driverError, context));
    case '23P01':
      return new ExclusionConstraintError(constraintOptions(driverError, context));
    case '57014':
      return new TimeoutError(driverError, context);
    default:
      return isConnectionFailure(driverError)
        ? mapConnectionError(driverError)
        : new DatabaseError(driverError, context);
  }
};

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

const isConnectionFailure = (error: DriverError): boolean =>
  error.code !== undefined && (CONNECTION_CODES.has(error.code) || error.code.startsWith('08'));

/** Maps an error raised while connecting to the matching Sequelize v6 connection error class. */
export const mapConnectionError = (error: unknown): ConnectionError => {
  if (error instanceof ConnectionError) {
    return error;
  }
  const driverError: DriverError = error instanceof Error ? error : new Error(String(error));
  const ErrorClass =
    (driverError.code === undefined ? undefined : CONNECTION_CODES.get(driverError.code)) ??
    ConnectionError;
  return new ErrorClass(driverError);
};
