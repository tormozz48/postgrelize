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
