/**
 * SQL as it was sent to PostgreSQL (`$1`, `$2`, ...) from the second argument of a `logging` callback,
 * whose first argument has the values inlined.
 */
export const parameterizedSql = (options: unknown): string =>
  (options as { parameterizedSql: string }).parameterizedSql;
