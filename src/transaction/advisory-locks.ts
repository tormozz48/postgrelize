import type { ConnectionManager, ExecuteOptions } from '../connection/connection-manager.ts';

/** Advisory lock key: a 64-bit integer, or a string hashed by PostgreSQL. */
export type AdvisoryLockKey = number | bigint | string;

/** Transaction-level advisory locks taken on the connection of one transaction. */
export class AdvisoryLocks {
  readonly #connections: ConnectionManager;
  readonly #executeOptions: () => ExecuteOptions;

  /**
   * @param connections - Connection manager running the lock statements.
   * @param executeOptions - Execute options bound to the owning transaction.
   */
  constructor(connections: ConnectionManager, executeOptions: () => ExecuteOptions) {
    this.#connections = connections;
    this.#executeOptions = executeOptions;
  }

  /**
   * Waits for and takes the lock.
   *
   * @param key - Lock key.
   * @param shared - Take a shared lock.
   * @returns Resolves when the lock is held.
   */
  async lock(key: AdvisoryLockKey, shared: boolean): Promise<void> {
    await this.#connections.execute(
      AdvisoryLocks.#query(shared ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock', key),
      this.#executeOptions(),
    );
  }

  /**
   * Tries to take the lock without waiting.
   *
   * @param key - Lock key.
   * @param shared - Take a shared lock.
   * @returns True when the lock was acquired.
   */
  async tryLock(key: AdvisoryLockKey, shared: boolean): Promise<boolean> {
    const fn = shared ? 'pg_try_advisory_xact_lock_shared' : 'pg_try_advisory_xact_lock';
    const result = await this.#connections.execute(
      AdvisoryLocks.#query(fn, key, 'locked'),
      this.#executeOptions(),
    );
    return result.rows[0]?.['locked'] === true;
  }

  static #query(fn: string, key: AdvisoryLockKey, alias = 'lock') {
    return {
      text:
        typeof key === 'string'
          ? `SELECT ${fn}(hashtextextended($1, 0)) AS "${alias}"`
          : `SELECT ${fn}($1::bigint) AS "${alias}"`,
      values: [typeof key === 'string' ? key : String(key)],
    };
  }
}
