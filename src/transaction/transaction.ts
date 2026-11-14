import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Client, ConnectionManager, ExecuteOptions } from '../connection/executor.ts';
import type { LoggingFunction } from '../connection/options.ts';
import { quoteIdent } from '../sql/compile.ts';

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
  /** SQL logger for transaction statements. */
  logging?: LoggingFunction | false;
}>;

const storage = new AsyncLocalStorage<Transaction>();

/** @internal */
export const currentTransaction = (): Transaction | undefined => storage.getStore();

/** @internal */
export const runWithTransaction = <T>(
  transaction: Transaction,
  run: () => Promise<T>,
): Promise<T> => storage.run(transaction, run);

const beginSql = (options: TransactionOptions): string =>
  [
    'START TRANSACTION',
    options.isolationLevel === undefined ? '' : ` ISOLATION LEVEL ${options.isolationLevel}`,
    options.readOnly === true ? ' READ ONLY' : '',
  ].join('');

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
    await this.#run(
      this.parent === undefined ? beginSql(this.options) : `SAVEPOINT ${quoteIdent(this.id)}`,
    );
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
        this.parent === undefined ? 'COMMIT' : `RELEASE SAVEPOINT ${quoteIdent(this.id)}`,
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
        this.parent === undefined ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${quoteIdent(this.id)}`,
      );
      this.finished = 'rollback';
    } finally {
      this.#release();
    }
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
}

/** Runs `run` inside a new transaction; commits on success, rolls back on error. */
export const runManagedTransaction = async <T>(
  transaction: Transaction,
  run: (transaction: Transaction) => Promise<T>,
): Promise<T> => {
  await transaction.begin();
  try {
    const result = await runWithTransaction(transaction, () => run(transaction));
    await transaction.commit();
    return result;
  } catch (error) {
    if (transaction.finished === undefined) {
      await transaction.rollback().catch(() => undefined);
    }
    throw error;
  }
};
