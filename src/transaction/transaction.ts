import { randomUUID } from 'node:crypto';
import type {
  Client,
  ConnectionManager,
  ExecuteOptions,
} from '../connection/connection-manager.ts';
import type { LoggingFunction } from '../connection/options.ts';
import type { RetryOptions, RetryRunner } from '../connection/retry.ts';
import { transactionScope } from './transaction-runner.ts';
import type { DeferrableValue } from '../ddl/ddl-types.ts';
import {
  AdvisoryLocks,
  type AdvisoryLockArgs,
  type AdvisoryLockKey,
  type AdvisoryLockOptions,
} from './advisory-locks.ts';
import { TransactionStatements } from './transaction-statements.ts';
import {
  ISOLATION_LEVELS,
  LOCK,
  TRANSACTION_TYPES,
  type IsolationLevel,
} from './transaction-constants.ts';

export { ISOLATION_LEVELS, LOCK, TRANSACTION_TYPES } from './transaction-constants.ts';
export type { AdvisoryLockKey, AdvisoryLockOptions } from './advisory-locks.ts';
export type { IsolationLevel, LockStrength } from './transaction-constants.ts';

/**
 * Options of `sequelize.transaction()`.
 *
 * All fields are optional.
 *
 * @example
 * ```ts
 * const options: TransactionOptions = {
 *   isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
 *   readOnly: true,
 *   deferrable: true,
 *   settings: { 'app.user_id': '42', statement_timeout: '5s' },
 * };
 * const t = await sequelize.transaction(options);
 * await t.commit();
 * ```
 */
export type TransactionOptions = Readonly<{
  /** Isolation level of a new transaction. */
  isolationLevel?: IsolationLevel;
  /** Accepted for compatibility, ignored. */
  type?: (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];
  /**
   * Start `READ ONLY`. PostgreSQL extension.
   * @postgrelize
   */
  readOnly?: boolean;
  /**
   * `true` / `false`: start `DEFERRABLE` / `NOT DEFERRABLE`. PostgreSQL honours it only for
   * `SERIALIZABLE READ ONLY` transactions: a deferrable one waits for a safe snapshot and then runs
   * without serialization failures; ignored for savepoints (PostgreSQL extension).
   * `Deferrable.SET_DEFERRED` / `Deferrable.SET_IMMEDIATE` (Sequelize v6): run `SET CONSTRAINTS ... DEFERRED` /
   * `IMMEDIATE` right after the transaction starts, for all constraints or the names given.
   * @postgrelize
   */
  deferrable?: boolean | DeferrableValue;
  /** Parent transaction: the new transaction becomes a savepoint inside it. */
  transaction?: Transaction | null;
  /**
   * Session settings applied with `SET LOCAL` semantics (`set_config(name, value, true)`), e.g.
   * `{ 'app.user_id': '42', statement_timeout: '5s' }` for row-level security. PostgreSQL extension.
   * @postgrelize
   */
  settings?: Readonly<Record<string, string | number | boolean>>;
  /** SQL logger for transaction statements. */
  logging?: LoggingFunction | false;
  /**
   * Retries acquiring the connection and `BEGIN` (and the statements that follow it, up to the
   * first user statement) when they fail, merged over the instance `retry` option (Sequelize v6).
   * Ignored for savepoints and for statements inside the transaction. See {@link RetryOptions}.
   */
  retry?: RetryOptions;
}>;

/**
 * Handle of an open database transaction or savepoint (Sequelize v6 `Transaction`).
 *
 * Obtain one from `sequelize.transaction()` and pass it to queries with the `transaction` option.
 * Unmanaged transactions must be finished with {@link Transaction.commit} or
 * {@link Transaction.rollback}; the connection is released to the pool when that happens.
 *
 * @example
 * ```ts
 * const t = await sequelize.transaction();
 * try {
 *   const created = await User.create({ name: 'Ann' }, { transaction: t });
 *   await Post.create({ title: 'Hi', userId: created.id }, { transaction: t });
 *   await t.commit();
 * } catch (e) {
 *   await t.rollback();
 *   throw e;
 * }
 * ```
 */
export class Transaction {
  /** Values for the `isolationLevel` option, e.g. `SERIALIZABLE` or `READ_COMMITTED`. */
  static readonly ISOLATION_LEVELS = ISOLATION_LEVELS;
  /** Row lock strengths. */
  static readonly LOCK = LOCK;
  /** Transaction types (ignored by PostgreSQL). */
  static readonly TYPES = TRANSACTION_TYPES;

  /** Unique id, used in SQL logs and as savepoint name. */
  readonly id: string = randomUUID();
  /** Options the transaction was started with. */
  readonly options: TransactionOptions;
  /** Parent transaction when this one is a savepoint. */
  readonly parent: Transaction | undefined;
  /** `'commit'` or `'rollback'` once the transaction is finished. */
  finished: 'commit' | 'rollback' | undefined;

  readonly #connections: ConnectionManager;
  readonly #advisoryLocks: AdvisoryLocks;
  readonly #statements: TransactionStatements;
  readonly #retries: RetryRunner | undefined;
  #client: Client | undefined;
  #holdsSessionLocks = false;
  #afterCommit: readonly ((transaction: Transaction) => unknown)[] = [];

  /**
   * Creates an unstarted transaction; use `sequelize.transaction()` instead of calling this directly.
   *
   * @param connections - Connection manager of the owning `Sequelize` instance.
   * @param options - Transaction options.
   * @param retries - Retry settings applied when starting the transaction.
   */
  constructor(
    connections: ConnectionManager,
    options: TransactionOptions = {},
    retries?: RetryRunner,
  ) {
    this.#connections = connections;
    this.#retries = retries;
    this.#advisoryLocks = new AdvisoryLocks(connections, () => this.executeOptions());
    this.options = options;
    this.parent = options.transaction ?? undefined;
    this.#statements = new TransactionStatements(this.id, this.parent !== undefined);
  }

  /** Row lock strengths (instance alias of {@link Transaction.LOCK}). */
  get LOCK(): typeof LOCK {
    return LOCK;
  }

  /** @internal */
  get client(): Client {
    const client = this.#client ?? this.parent?.client;
    if (client === undefined) {
      throw new Error('Transaction has not started');
    }
    return client;
  }

  /** @internal */
  executeOptions(): ExecuteOptions {
    return {
      client: this.client,
      transactionId: this.id,
      ...(this.options.logging === undefined ? {} : { logging: this.options.logging }),
    };
  }

  /** @internal */
  async begin(): Promise<this> {
    await (this.parent === undefined && this.#retries !== undefined
      ? this.#retries.run(() => this.#start(), this.options.retry)
      : this.#start());
    return this;
  }

  async #start(): Promise<void> {
    if (this.parent === undefined) {
      this.#client = await this.#connections.getConnection({ type: 'write', uuid: this.id });
    }
    try {
      await this.#run(this.#statements.begin(this.options));
      await this.#applySettings();
      await this.#setConstraints();
    } catch (error) {
      await this.#abortBegin();
      throw error;
    }
  }

  /**
   * Commits the transaction (or releases the savepoint) and runs `afterCommit` hooks.
   *
   * @returns Resolves when committed and all `afterCommit` hooks have run.
   * @throws Error when the transaction is already finished.
   *
   * @example
   * ```ts
   * const t = await sequelize.transaction();
   * await User.create({ name: 'Ann' }, { transaction: t });
   * await t.commit();
   * ```
   */
  async commit(): Promise<void> {
    this.#assertActive('commit');
    // marked at once: a query issued while the COMMIT is on its way is rejected (v6)
    this.finished = 'commit';
    try {
      await this.#run(this.#statements.commit());
    } finally {
      await this.#release();
    }
    await this.#afterCommit.reduce<Promise<unknown>>(
      (previous, hook) => previous.then(() => hook(this)),
      Promise.resolve(),
    );
  }

  /**
   * Rolls the transaction back (or rolls back to the savepoint).
   *
   * @returns Resolves when rolled back.
   * @throws Error when the transaction is already finished.
   *
   * @example
   * ```ts
   * const t = await sequelize.transaction();
   * try {
   *   await User.create({ name: 'Ann' }, { transaction: t });
   *   await t.commit();
   * } catch (e) {
   *   await t.rollback();
   * }
   * ```
   */
  async rollback(): Promise<void> {
    this.#assertActive('rollback');
    this.finished = 'rollback';
    try {
      await this.#run(this.#statements.rollback());
    } finally {
      await this.#release();
    }
  }

  /**
   * Takes an advisory lock, waiting until it is free: `pg_advisory_xact_lock`, released on commit or
   * rollback, unless `session: true`. PostgreSQL extension.
   *
   * @postgrelize
   * @param key - Integer key, or a string hashed with `hashtextextended`.
   * @param options - `shared`, `session`.
   * @returns Resolves when the lock is held.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   await t.advisoryLock('invoice-42');
   *   await Invoice.update({ status: 'sent' }, { where: { id: 42 }, transaction: t });
   * });
   * ```
   */
  advisoryLock(key: AdvisoryLockKey, options?: AdvisoryLockOptions): Promise<void>;
  /**
   * Takes the advisory lock named by two 32-bit integers (`pg_advisory_xact_lock(int4, int4)`),
   * waiting until it is free. The keys are passed as they are, never hashed. This key space is
   * separate from the one-key form. PostgreSQL extension.
   *
   * @postgrelize
   * @param key1 - First `int4` key.
   * @param key2 - Second `int4` key.
   * @param options - `shared`, `session`.
   * @returns Resolves when the lock is held.
   * @throws TypeError when a key is not an `int4` integer.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   await t.advisoryLock(7, 42, { shared: true });
   * });
   * ```
   */
  advisoryLock(key1: number, key2: number, options?: AdvisoryLockOptions): Promise<void>;
  async advisoryLock(...args: AdvisoryLockArgs): Promise<void> {
    this.#trackSessionLock(args);
    await this.#advisoryLocks.lock(args);
  }

  /**
   * Tries to take an advisory lock without waiting. PostgreSQL extension.
   *
   * @postgrelize
   * @param key - Integer key, or a string hashed with `hashtextextended`.
   * @param options - `shared`, `session`.
   * @returns True when the lock was acquired.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   if (await t.tryAdvisoryLock(42, { shared: true })) {
   *     await Task.findAll({ transaction: t });
   *   }
   * });
   * ```
   */
  tryAdvisoryLock(key: AdvisoryLockKey, options?: AdvisoryLockOptions): Promise<boolean>;
  /**
   * Tries to take the advisory lock of two `int4` keys without waiting. PostgreSQL extension.
   *
   * @postgrelize
   * @param key1 - First `int4` key.
   * @param key2 - Second `int4` key.
   * @param options - `shared`, `session`.
   * @returns True when the lock was acquired.
   * @throws TypeError when a key is not an `int4` integer.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   const locked = await t.tryAdvisoryLock(7, 42);
   * });
   * ```
   */
  tryAdvisoryLock(key1: number, key2: number, options?: AdvisoryLockOptions): Promise<boolean>;
  async tryAdvisoryLock(...args: AdvisoryLockArgs): Promise<boolean> {
    this.#trackSessionLock(args);
    return this.#advisoryLocks.tryLock(args);
  }

  /**
   * Releases one hold of a session-level advisory lock (`pg_advisory_unlock`) taken with
   * `session: true`. Transaction-level locks cannot be released early. PostgreSQL extension.
   *
   * @postgrelize
   * @param key - The key the lock was taken with.
   * @param options - `shared: true` releases a shared hold.
   * @returns False when this connection did not hold the lock.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   await t.advisoryLock('import', { session: true });
   *   await t.advisoryUnlock('import');
   * });
   * ```
   */
  advisoryUnlock(key: AdvisoryLockKey, options?: AdvisoryLockOptions): Promise<boolean>;
  /**
   * Releases one hold of a session-level lock of two `int4` keys. PostgreSQL extension.
   *
   * @postgrelize
   * @param key1 - First `int4` key.
   * @param key2 - Second `int4` key.
   * @param options - `shared: true` releases a shared hold.
   * @returns False when this connection did not hold the lock.
   * @throws TypeError when a key is not an `int4` integer.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   await t.advisoryLock(7, 42, { session: true });
   *   await t.advisoryUnlock(7, 42);
   * });
   * ```
   */
  advisoryUnlock(key1: number, key2: number, options?: AdvisoryLockOptions): Promise<boolean>;
  async advisoryUnlock(...args: AdvisoryLockArgs): Promise<boolean> {
    return this.#advisoryLocks.unlock(args);
  }

  /**
   * Registers a callback run after a successful commit.
   *
   * @param hook - Callback receiving this transaction; hooks run in registration order after the
   * transaction is committed and are awaited by `commit()`. They never run after a rollback.
   *
   * @example
   * ```ts
   * await sequelize.transaction(async (t) => {
   *   t.afterCommit(() => console.log('committed, safe to notify'));
   *   await User.create({ name: 'Ann' }, { transaction: t });
   * });
   * ```
   */
  afterCommit(hook: (transaction: Transaction) => unknown): void {
    if (typeof hook !== 'function') {
      throw new Error('"fn" must be a function');
    }
    this.#afterCommit = [...this.#afterCommit, hook];
  }

  async #setConstraints(): Promise<void> {
    const { deferrable } = this.options;
    if (typeof deferrable !== 'boolean' && deferrable !== undefined) {
      await this.#run(deferrable.sql);
    }
  }

  async #applySettings(): Promise<void> {
    await Object.entries(this.options.settings ?? {}).reduce<Promise<unknown>>(
      (previous, [name, value]) =>
        previous.then(() =>
          this.#connections.execute(
            { text: 'SELECT set_config($1, $2, true)', values: [name, String(value)] },
            this.executeOptions(),
          ),
        ),
      Promise.resolve(),
    );
  }

  async #abortBegin(): Promise<void> {
    if (this.parent === undefined) {
      // Never return a connection inside an open (possibly aborted) transaction to the pool.
      await this.#run(this.#statements.rollback()).catch(() => undefined);
      await this.#release();
    }
  }

  #assertActive(action: string): void {
    if (this.finished !== undefined) {
      throw new Error(
        `Transaction cannot be ${action === 'commit' ? 'committed' : 'rolled back'} because it has been finished with state: ${this.finished}`,
      );
    }
  }

  async #run(sql: string): Promise<void> {
    await this.#connections.execute({ text: sql, values: [] }, this.executeOptions());
  }

  // Session locks live on the connection, which the outermost transaction owns.
  #trackSessionLock(args: AdvisoryLockArgs): void {
    if (args.some((arg) => typeof arg === 'object' && arg?.session === true)) {
      this.#root().#holdsSessionLocks = true;
    }
  }

  #root(): Transaction {
    return this.parent === undefined ? this : this.parent.#root();
  }

  async #release(): Promise<void> {
    transactionScope.release(this);
    if (this.parent !== undefined || this.#client === undefined) {
      return;
    }
    // A pooled connection must not keep session locks; one that cannot drop them is closed.
    const unlocked = this.#holdsSessionLocks
      ? await this.#advisoryLocks.unlockAll().then(
          () => true,
          () => false,
        )
      : true;
    const client = this.#client;
    this.#client = undefined;
    await (unlocked
      ? this.#connections.releaseConnection(client)
      : this.#connections.destroyConnection(client));
  }
}
