import { randomUUID } from 'node:crypto';
import type {
  Client,
  ConnectionManager,
  ExecuteOptions,
} from '../connection/connection-manager.ts';
import type { LoggingFunction } from '../connection/options.ts';
import { AdvisoryLocks, type AdvisoryLockKey } from './advisory-locks.ts';
import { TransactionStatements } from './transaction-statements.ts';
import {
  ISOLATION_LEVELS,
  LOCK,
  TRANSACTION_TYPES,
  type IsolationLevel,
} from './transaction-constants.ts';

export { ISOLATION_LEVELS, LOCK, TRANSACTION_TYPES } from './transaction-constants.ts';
export type { AdvisoryLockKey } from './advisory-locks.ts';
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
  /** Start `READ ONLY`. PostgreSQL extension. */
  readOnly?: boolean;
  /**
   * Start `DEFERRABLE` (`true`) or `NOT DEFERRABLE` (`false`). PostgreSQL honours it only for
   * `SERIALIZABLE READ ONLY` transactions: a deferrable one waits for a safe snapshot and then runs
   * without serialization failures. Ignored for savepoints. PostgreSQL extension.
   */
  deferrable?: boolean;
  /** Parent transaction: the new transaction becomes a savepoint inside it. */
  transaction?: Transaction | null;
  /**
   * Session settings applied with `SET LOCAL` semantics (`set_config(name, value, true)`), e.g.
   * `{ 'app.user_id': '42', statement_timeout: '5s' }` for row-level security. PostgreSQL extension.
   */
  settings?: Readonly<Record<string, string | number | boolean>>;
  /** SQL logger for transaction statements. */
  logging?: LoggingFunction | false;
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
  #client: Client | undefined;
  #afterCommit: readonly ((transaction: Transaction) => unknown)[] = [];

  /**
   * Creates an unstarted transaction; use `sequelize.transaction()` instead of calling this directly.
   *
   * @param connections - Connection manager of the owning `Sequelize` instance.
   * @param options - Transaction options.
   */
  constructor(connections: ConnectionManager, options: TransactionOptions = {}) {
    this.#connections = connections;
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
    if (this.parent === undefined) {
      this.#client = await this.#connections.acquire();
    }
    try {
      await this.#run(this.#statements.begin(this.options));
      await this.#applySettings();
    } catch (error) {
      await this.#abortBegin();
      throw error;
    }
    return this;
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
    try {
      await this.#run(this.#statements.commit());
      this.finished = 'commit';
    } finally {
      this.#release();
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
    try {
      await this.#run(this.#statements.rollback());
      this.finished = 'rollback';
    } finally {
      this.#release();
    }
  }

  /**
   * Takes a transaction-level advisory lock (`pg_advisory_xact_lock`), waiting until it is free.
   * The lock is released on commit or rollback. PostgreSQL extension.
   *
   * @param key - Integer key, or a string hashed with `hashtextextended`.
   * @param options - `shared: true` for a shared lock.
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
  async advisoryLock(
    key: AdvisoryLockKey,
    options: Readonly<{ shared?: boolean }> = {},
  ): Promise<void> {
    await this.#advisoryLocks.lock(key, options.shared === true);
  }

  /**
   * Tries to take a transaction-level advisory lock without waiting. PostgreSQL extension.
   *
   * @param key - Integer key, or a string hashed with `hashtextextended`.
   * @param options - `shared: true` for a shared lock.
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
  async tryAdvisoryLock(
    key: AdvisoryLockKey,
    options: Readonly<{ shared?: boolean }> = {},
  ): Promise<boolean> {
    return this.#advisoryLocks.tryLock(key, options.shared === true);
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
    this.#afterCommit = [...this.#afterCommit, hook];
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
      this.#release();
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

  #release(): void {
    if (this.parent === undefined && this.#client !== undefined) {
      this.#client.release();
      this.#client = undefined;
    }
  }
}
