import type { ConnectionManager, ExecuteOptions } from '../connection/connection-manager.ts';

/** Advisory lock key: a 64-bit integer, or a string hashed by PostgreSQL. */
export type AdvisoryLockKey = number | bigint | string;

/**
 * Options of the advisory lock methods of {@link Transaction}.
 *
 * @example
 * ```ts
 * const options: AdvisoryLockOptions = { shared: true, session: true };
 * ```
 */
export type AdvisoryLockOptions = Readonly<{
  /**
   * Take (or release) a shared lock; shared holders do not block each other.
   * @defaultValue false
   */
  shared?: boolean;
  /**
   * Session-level lock (`pg_advisory_lock`) instead of a transaction-level one: it survives a
   * savepoint rollback and can be released early with `advisoryUnlock`. postgrelize releases what is
   * still held when the outermost transaction ends, before the connection returns to the pool.
   * PostgreSQL extension.
   * @defaultValue false
   * @postgrelize
   */
  session?: boolean;
}>;

/** @internal Arguments of the lock methods: one key, or two `int4` keys, then the options. */
export type AdvisoryLockArgs = readonly [
  key: AdvisoryLockKey,
  second?: number | AdvisoryLockOptions,
  third?: AdvisoryLockOptions,
];

type LockCall = Readonly<{
  params: string;
  values: readonly string[];
  options: AdvisoryLockOptions;
}>;

const INT4_LIMIT = 2 ** 31;

/** Advisory locks taken on the connection of one transaction. */
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
   * @param args - Key or key pair, then options.
   * @returns Resolves when the lock is held.
   * @throws TypeError when a key of a pair is not an `int4`.
   */
  async lock(args: AdvisoryLockArgs): Promise<void> {
    const call = AdvisoryLocks.#parse(args);
    const scope = call.options.session === true ? '' : 'xact_';
    await this.#run(`pg_advisory_${scope}lock`, call, 'lock');
  }

  /**
   * Tries to take the lock without waiting.
   *
   * @param args - Key or key pair, then options.
   * @returns True when the lock was acquired.
   * @throws TypeError when a key of a pair is not an `int4`.
   */
  async tryLock(args: AdvisoryLockArgs): Promise<boolean> {
    const call = AdvisoryLocks.#parse(args);
    const scope = call.options.session === true ? '' : 'xact_';
    return (await this.#run(`pg_try_advisory_${scope}lock`, call, 'locked')) === true;
  }

  /**
   * Releases one hold of a session-level lock.
   *
   * @param args - Key or key pair, then options.
   * @returns False when this session did not hold the lock.
   * @throws TypeError when a key of a pair is not an `int4`.
   */
  async unlock(args: AdvisoryLockArgs): Promise<boolean> {
    const call = AdvisoryLocks.#parse(args);
    return (await this.#run('pg_advisory_unlock', call, 'unlocked')) === true;
  }

  /**
   * Releases every session-level lock of the connection.
   *
   * @returns Resolves when released.
   */
  async unlockAll(): Promise<void> {
    await this.#connections.execute(
      { text: 'SELECT pg_advisory_unlock_all()', values: [] },
      this.#executeOptions(),
    );
  }

  async #run(name: string, call: LockCall, alias: string): Promise<unknown> {
    const fn = call.options.shared === true ? `${name}_shared` : name;
    const result = await this.#connections.execute(
      { text: `SELECT ${fn}(${call.params}) AS "${alias}"`, values: [...call.values] },
      this.#executeOptions(),
    );
    return result.rows[0]?.[alias];
  }

  static #parse([key, second, third]: AdvisoryLockArgs): LockCall {
    if (second === undefined || (typeof second === 'object' && second !== null)) {
      return {
        params: typeof key === 'string' ? 'hashtextextended($1, 0)' : '$1::bigint',
        values: [String(key)],
        options: second ?? {},
      };
    }
    return {
      params: '$1::int4, $2::int4',
      values: [AdvisoryLocks.#int4(key), AdvisoryLocks.#int4(second)],
      options: third ?? {},
    };
  }

  // A string is never hashed or coerced here: the pair must name the same lock as raw SQL does.
  static #int4(key: unknown): string {
    if (!Number.isInteger(key) || (key as number) < -INT4_LIMIT || (key as number) >= INT4_LIMIT) {
      throw new TypeError(`Advisory lock keys of a pair must be int4 integers, got ${String(key)}`);
    }
    return String(key);
  }
}
