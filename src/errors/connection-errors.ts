import { BaseError } from './base-error.ts';

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
