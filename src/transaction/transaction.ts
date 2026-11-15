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

/** Options of `sequelize.transaction()`. */
export type TransactionOptions = Readonly<{
  /** Isolation level of a new transaction. */
  isolationLevel?: IsolationLevel;
  /** Accepted for compatibility, ignored. */
  type?: (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];
  /** Start `READ ONLY`. PostgreSQL extension. */
  readOnly?: boolean;
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
 * Database transaction (Sequelize v6 `Transaction`). Obtain one from `sequelize.transaction()`;
 * pass it to queries with the `transaction` option.
 */
export class Transaction {
  /** Isolation levels. */
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
   * @returns Resolves when committed.
   * @throws Error when the transaction is already finished.
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
   * @param hook - Callback receiving this transaction.
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
