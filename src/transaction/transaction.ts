import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type {
  Client,
  ConnectionManager,
  ExecuteOptions,
} from '../connection/connection-manager.ts';
import type { LoggingFunction } from '../connection/options.ts';
import { SqlCompiler } from '../sql/compile.ts';

/** Transaction isolation levels (Sequelize v6 `Transaction.ISOLATION_LEVELS`). */
export const ISOLATION_LEVELS = {
  /** `READ UNCOMMITTED` (behaves as `READ COMMITTED` in PostgreSQL). */
  READ_UNCOMMITTED: 'READ UNCOMMITTED',
  /** `READ COMMITTED` (PostgreSQL default). */
  READ_COMMITTED: 'READ COMMITTED',
  /** `REPEATABLE READ`. */
  REPEATABLE_READ: 'REPEATABLE READ',
  /** `SERIALIZABLE`. */
  SERIALIZABLE: 'SERIALIZABLE',
} as const;

/** One of {@link ISOLATION_LEVELS}. */
export type IsolationLevel = (typeof ISOLATION_LEVELS)[keyof typeof ISOLATION_LEVELS];

/** Row lock strengths for `findAll({ lock })` (Sequelize v6 `Transaction.LOCK`). */
export const LOCK = {
  /** `FOR UPDATE`. */
  UPDATE: 'UPDATE',
  /** `FOR SHARE`. */
  SHARE: 'SHARE',
  /** `FOR KEY SHARE`. */
  KEY_SHARE: 'KEY SHARE',
  /** `FOR NO KEY UPDATE`. */
  NO_KEY_UPDATE: 'NO KEY UPDATE',
} as const;

/** One of {@link LOCK}. */
export type LockStrength = (typeof LOCK)[keyof typeof LOCK];

/** Transaction types; accepted for Sequelize v6 compatibility and ignored by PostgreSQL. */
export const TRANSACTION_TYPES = {
  /** SQLite-only, ignored. */
  DEFERRED: 'DEFERRED',
  /** SQLite-only, ignored. */
  IMMEDIATE: 'IMMEDIATE',
  /** SQLite-only, ignored. */
  EXCLUSIVE: 'EXCLUSIVE',
} as const;

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

/** Advisory lock key: a 64-bit integer, or a string hashed by PostgreSQL. */
export type AdvisoryLockKey = number | bigint | string;

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
  #client: Client | undefined;
  #afterCommit: readonly ((transaction: Transaction) => unknown)[] = [];

  /**
   * @param connections - Connection manager of the owning `Sequelize` instance.
   * @param options - Transaction options.
   */
  constructor(connections: ConnectionManager, options: TransactionOptions = {}) {
    this.#connections = connections;
    this.options = options;
    this.parent = options.transaction ?? undefined;
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
      await this.#run(
        this.parent === undefined
          ? Transaction.#beginSql(this.options)
          : `SAVEPOINT ${SqlCompiler.quoteIdent(this.id)}`,
      );
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
    } catch (error) {
      if (this.parent === undefined) {
        // Never return a connection inside an open (possibly aborted) transaction to the pool.
        await this.#run('ROLLBACK').catch(() => undefined);
        this.#release();
      }
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
      await this.#run(
        this.parent === undefined
          ? 'COMMIT'
          : `RELEASE SAVEPOINT ${SqlCompiler.quoteIdent(this.id)}`,
      );
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
      await this.#run(
        this.parent === undefined
          ? 'ROLLBACK'
          : `ROLLBACK TO SAVEPOINT ${SqlCompiler.quoteIdent(this.id)}`,
      );
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
    await this.#connections.execute(
      Transaction.#advisoryLockQuery(
        options.shared === true ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock',
        key,
      ),
      this.executeOptions(),
    );
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
    const result = await this.#connections.execute(
      Transaction.#advisoryLockQuery(
        options.shared === true ? 'pg_try_advisory_xact_lock_shared' : 'pg_try_advisory_xact_lock',
        key,
        'locked',
      ),
      this.executeOptions(),
    );
    return result.rows[0]?.['locked'] === true;
  }

  /**
   * Registers a callback run after a successful commit.
   *
   * @param hook - Callback receiving this transaction.
   */
  afterCommit(hook: (transaction: Transaction) => unknown): void {
    this.#afterCommit = [...this.#afterCommit, hook];
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

  static #beginSql(options: TransactionOptions): string {
    return [
      'START TRANSACTION',
      options.isolationLevel === undefined ? '' : ` ISOLATION LEVEL ${options.isolationLevel}`,
      options.readOnly === true ? ' READ ONLY' : '',
    ].join('');
  }

  static #advisoryLockQuery(fn: string, key: AdvisoryLockKey, alias = 'lock') {
    return {
      text:
        typeof key === 'string'
          ? `SELECT ${fn}(hashtextextended($1, 0)) AS "${alias}"`
          : `SELECT ${fn}($1::bigint) AS "${alias}"`,
      values: [typeof key === 'string' ? key : String(key)],
    };
  }
}

/** Continuation-local storage of the current transaction (`AsyncLocalStorage`, used by `Sequelize.useCLS`). */
export class TransactionContext {
  readonly #storage = new AsyncLocalStorage<Transaction>();

  /**
   * Transaction of the current async context.
   *
   * @returns The transaction, or `undefined` outside `run`.
   */
  current(): Transaction | undefined {
    return this.#storage.getStore();
  }

  /**
   * Runs `run` with `transaction` as the current transaction.
   *
   * @param transaction - Transaction to make current.
   * @param run - Callback.
   * @returns Result of `run`.
   */
  run<T>(transaction: Transaction, run: () => Promise<T>): Promise<T> {
    return this.#storage.run(transaction, run);
  }
}

/** Runs managed transactions: begins, runs the callback, commits on success and rolls back on error. */
export class TransactionRunner {
  readonly #context: TransactionContext;

  /**
   * @param context - Context the transaction is made current in while the callback runs.
   */
  constructor(context: TransactionContext) {
    this.#context = context;
  }

  /**
   * Runs `run` inside `transaction`.
   *
   * @param transaction - Transaction, not started yet.
   * @param run - Callback receiving the transaction.
   * @returns Result of `run`.
   */
  async run<T>(
    transaction: Transaction,
    run: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    await transaction.begin();
    try {
      const result = await this.#context.run(transaction, () => run(transaction));
      await transaction.commit();
      return result;
    } catch (error) {
      if (transaction.finished === undefined) {
        await transaction.rollback().catch(() => undefined);
      }
      throw error;
    }
  }
}
