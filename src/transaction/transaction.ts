import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Effect, Exit } from 'effect';
import type { BaseError } from '../errors/errors.ts';
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

const advisoryLockQuery = (fn: string, key: AdvisoryLockKey, alias = 'lock') => ({
  text:
    typeof key === 'string'
      ? `SELECT ${fn}(hashtextextended($1, 0)) AS "${alias}"`
      : `SELECT ${fn}($1::bigint) AS "${alias}"`,
  values: [typeof key === 'string' ? key : String(key)],
});

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

  /**
   * @internal Starts the transaction (or savepoint) and applies `settings`. A root transaction holds
   * a pooled client until commit / rollback; when starting fails the client is released.
   */
  beginEffect(): Effect.Effect<this, BaseError | Error> {
    const opening = this.#run(
      this.parent === undefined ? beginSql(this.options) : `SAVEPOINT ${quoteIdent(this.id)}`,
    );
    const settings = Object.entries(this.options.settings ?? {});
    // Kept to the minimum number of Effect nodes: this runs for every transaction (see bench/).
    const start = (
      settings.length === 0
        ? opening
        : opening.pipe(
            Effect.andThen(
              Effect.forEach(
                settings,
                ([name, value]) =>
                  this.#connections.effects.execute(
                    { text: 'SELECT set_config($1, $2, true)', values: [name, String(value)] },
                    this.executeOptions(),
                  ),
                { discard: true },
              ),
            ),
          )
    ).pipe(Effect.as(this));
    if (this.parent !== undefined) {
      return start;
    }
    return this.#connections.effects.acquire.pipe(
      Effect.flatMap((client) => {
        this.#client = client;
        return start.pipe(
          // Never return a connection inside an open (possibly aborted) transaction to the pool.
          Effect.onError(() =>
            Effect.exit(this.#run('ROLLBACK')).pipe(
              Effect.andThen(Effect.sync(() => this.#release())),
            ),
          ),
        );
      }),
    );
  }

  /** @internal Commits (or releases the savepoint), releases the client, runs `afterCommit` hooks. */
  commitEffect(): Effect.Effect<void, BaseError | Error> {
    return this.#finish(
      'commit',
      this.parent === undefined ? 'COMMIT' : `RELEASE SAVEPOINT ${quoteIdent(this.id)}`,
    ).pipe(
      Effect.andThen(
        Effect.suspend(() =>
          this.#afterCommit.length === 0
            ? Effect.void
            : Effect.forEach(
                this.#afterCommit,
                (hook) =>
                  Effect.tryPromise({
                    try: async () => hook(this),
                    catch: (error) => error as Error,
                  }),
                { discard: true },
              ),
        ),
      ),
    );
  }

  /** @internal Rolls back (or to the savepoint) and releases the client. */
  rollbackEffect(): Effect.Effect<void, BaseError | Error> {
    return this.#finish(
      'rollback',
      this.parent === undefined ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${quoteIdent(this.id)}`,
    );
  }

  #finish(state: 'commit' | 'rollback', sql: string): Effect.Effect<void, BaseError | Error> {
    return Effect.suspend(() =>
      this.finished === undefined
        ? this.#run(sql).pipe(
            Effect.map(() => {
              this.finished = state;
            }),
            Effect.ensuring(Effect.sync(() => this.#release())),
          )
        : Effect.fail(
            new Error(
              `Transaction cannot be ${state === 'commit' ? 'committed' : 'rolled back'} because it has been finished with state: ${this.finished}`,
            ),
          ),
    );
  }

  /** @internal */
  async begin(): Promise<this> {
    return Effect.runPromise(this.beginEffect());
  }

  /**
   * Commits the transaction (or releases the savepoint) and runs `afterCommit` hooks.
   *
   * @returns Resolves when committed.
   * @throws Error when the transaction is already finished.
   */
  async commit(): Promise<void> {
    return Effect.runPromise(this.commitEffect());
  }

  /**
   * Rolls the transaction back (or rolls back to the savepoint).
   *
   * @returns Resolves when rolled back.
   * @throws Error when the transaction is already finished.
   */
  async rollback(): Promise<void> {
    return Effect.runPromise(this.rollbackEffect());
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
      advisoryLockQuery(
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
      advisoryLockQuery(
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

  #run(sql: string): Effect.Effect<void, BaseError | Error> {
    return Effect.try({ try: () => this.executeOptions(), catch: (error) => error as Error }).pipe(
      Effect.flatMap((options) =>
        this.#connections.effects.execute({ text: sql, values: [] }, options),
      ),
      Effect.asVoid,
    );
  }

  #release(): void {
    if (this.parent === undefined && this.#client !== undefined) {
      this.#client.release();
      this.#client = undefined;
    }
  }
}

/**
 * Runs `use` inside `transaction`: begins it, commits when `use` succeeds, and rolls back when it
 * fails or is interrupted. The rollback error, if any, is dropped in favour of the original failure.
 */
export const managedTransaction = <A, E>(
  transaction: Transaction,
  use: (transaction: Transaction) => Effect.Effect<A, E>,
): Effect.Effect<A, E | BaseError | Error> =>
  Effect.acquireUseRelease(
    transaction.beginEffect(),
    (started) => use(started).pipe(Effect.tap(() => started.commitEffect())),
    (started, exit) =>
      Exit.isFailure(exit) && started.finished === undefined
        ? Effect.asVoid(Effect.exit(started.rollbackEffect()))
        : Effect.void,
  );

/** Runs `run` inside a new transaction; commits on success, rolls back on error. */
export const runManagedTransaction = <T>(
  transaction: Transaction,
  run: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  Effect.runPromise(
    managedTransaction(transaction, (started) =>
      Effect.tryPromise({
        try: () => runWithTransaction(started, () => run(started)),
        catch: (error) => error,
      }),
    ),
  );
