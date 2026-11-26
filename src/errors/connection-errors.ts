import { BaseError } from './base-error.ts';

/**
 * Failure to reach or authenticate against PostgreSQL (Sequelize v6 `ConnectionError`).
 *
 * Thrown when connecting fails and for driver errors with an unmapped `08xxx` SQLSTATE. The subclasses below narrow the cause; `parent` and `original` hold the driver error.
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof ConnectionError) {
 *     console.error('cannot connect:', e.parent.message);
 *   }
 * }
 * ```
 */
export class ConnectionError extends BaseError {
  /** Original driver error. */
  readonly parent: Error;
  /** Original driver error (alias of `parent`). */
  readonly original: Error;

  /**
   * Wraps a driver error; the message and `cause` are taken from it.
   *
   * @param parent - Original driver error.
   */
  constructor(parent: Error) {
    // like v6, no parent (`new ConnectionError(null)`) gives an empty message
    super((parent as Error | null)?.message ?? '', { cause: parent });
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

/**
 * Thrown when the server refuses the connection (`ECONNREFUSED`), typically because PostgreSQL is not running on that host and port.
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof ConnectionRefusedError) {
 *     console.error('database is down');
 *   }
 * }
 * ```
 */
export class ConnectionRefusedError extends connectionError('SequelizeConnectionRefusedError') {}
/**
 * Thrown when PostgreSQL rejects the credentials (SQLSTATE `28P01` or `28000`).
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof AccessDeniedError) {
 *     console.error('check username and password');
 *   }
 * }
 * ```
 */
export class AccessDeniedError extends connectionError('SequelizeAccessDeniedError') {}
/**
 * Thrown when the host name cannot be resolved (`ENOTFOUND` or `EAI_AGAIN`).
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof HostNotFoundError) {
 *     console.error('unknown database host');
 *   }
 * }
 * ```
 */
export class HostNotFoundError extends connectionError('SequelizeHostNotFoundError') {}
/**
 * Thrown when no route to the host exists (`EHOSTUNREACH`).
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof HostNotReachableError) {
 *     console.error('database host is unreachable');
 *   }
 * }
 * ```
 */
export class HostNotReachableError extends connectionError('SequelizeHostNotReachableError') {}
/**
 * Thrown when the connection parameters are rejected by the network layer (`EINVAL`).
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof InvalidConnectionError) {
 *     console.error('check host and port settings');
 *   }
 * }
 * ```
 */
export class InvalidConnectionError extends connectionError('SequelizeInvalidConnectionError') {}
/**
 * Thrown when the TCP connection to the server times out (`ETIMEDOUT`).
 *
 * @example
 * ```ts
 * try {
 *   await sequelize.authenticate();
 * } catch (e) {
 *   if (e instanceof ConnectionTimedOutError) {
 *     console.error('database did not answer in time');
 *   }
 * }
 * ```
 */
export class ConnectionTimedOutError extends connectionError('SequelizeConnectionTimedOutError') {}
/**
 * Thrown when no pooled connection became free within `pool.acquire` milliseconds (default 60000).
 *
 * Raise `pool.max` or shorten the transactions that hold connections.
 * See {@link PoolOptions}.
 *
 * @example
 * ```ts
 * try {
 *   await User.findAll();
 * } catch (e) {
 *   if (e instanceof ConnectionAcquireTimeoutError) {
 *     console.error('pool exhausted');
 *   }
 * }
 * ```
 */
export class ConnectionAcquireTimeoutError extends connectionError(
  'SequelizeConnectionAcquireTimeoutError',
) {}
