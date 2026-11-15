/** Driver error object as produced by `pg` (a subset of its fields). */
export type DriverError = Error &
  Readonly<{
    /** SQLSTATE or Node.js error code. */
    code?: string;
    /** Error detail reported by PostgreSQL. */
    detail?: string;
    /** Table the error refers to. */
    table?: string;
    /** Constraint the error refers to. */
    constraint?: string;
    /** Schema the error refers to. */
    schema?: string;
    /** Column the error refers to. */
    column?: string;
  }>;

/**
 * Root of the error hierarchy, so one `instanceof` check catches every error postgrelize throws (Sequelize v6 `BaseError`).
 *
 * Programmer mistakes (such as committing a finished transaction) still throw a plain `Error`.
 *
 * @example
 * ```ts
 * try {
 *   await User.findOne({ where: { id: 1 }, rejectOnEmpty: true });
 * } catch (e) {
 *   if (e instanceof BaseError) {
 *     console.error(e.name, e.message);
 *   }
 * }
 * ```
 */
export class BaseError extends Error {
  /**
   * Creates the error and sets `name` to `'SequelizeBaseError'`.
   *
   * @param message - Error message.
   * @param options - Standard error options (`cause`).
   */
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SequelizeBaseError';
  }
}
