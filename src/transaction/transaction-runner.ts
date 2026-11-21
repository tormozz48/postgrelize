import { AsyncLocalStorage } from 'node:async_hooks';
import { NamespaceContext } from './cls-namespace.ts';
import type { Transaction } from './transaction.ts';

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
  readonly #context: Pick<TransactionContext, 'run'>;

  /**
   * @param context - Context the transaction is made current in while the callback runs.
   */
  constructor(context: Pick<TransactionContext, 'run'>) {
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

/**
 * Transaction scope shared by every `Sequelize` instance: the `useCLS` switch, the current
 * transaction of the async context and the managed-transaction runner.
 */
export class TransactionScope {
  readonly #context = new TransactionContext();
  #namespace: NamespaceContext | undefined;
  #runner = new TransactionRunner(this.#context);
  #cls = false;

  /**
   * Enables continuation-local transactions.
   *
   * @param namespace - CLS namespace (v6 style); `AsyncLocalStorage` is used without one.
   * @throws Error when `namespace` is given but is not a CLS namespace.
   */
  enableCls(namespace?: unknown): void {
    this.#namespace = namespace === undefined ? undefined : new NamespaceContext(namespace);
    this.#runner = new TransactionRunner(this.#namespace ?? this.#context);
    this.#cls = true;
  }

  /**
   * Transaction that queries without a `transaction` option use.
   *
   * @returns The transaction, or `undefined` when CLS is off or outside a managed transaction.
   */
  active(): Transaction | undefined {
    return this.#namespace?.current() ?? this.implicitParent();
  }

  /**
   * Parent of a new transaction started without `transaction`: with `AsyncLocalStorage` CLS the
   * enclosing managed transaction (savepoint); with a v6 namespace none, as in v6.
   *
   * @returns The enclosing transaction, if any.
   */
  implicitParent(): Transaction | undefined {
    return this.#cls && this.#namespace === undefined ? this.#context.current() : undefined;
  }

  /**
   * Called when a transaction releases its connection.
   *
   * @param transaction - Finished transaction.
   */
  release(transaction: Transaction): void {
    this.#namespace?.release(transaction);
  }

  /**
   * Runs `run` inside `transaction`, committing or rolling back.
   *
   * @param transaction - Transaction, not started yet.
   * @param run - Callback receiving the transaction.
   * @returns Result of `run`.
   */
  run<T>(transaction: Transaction, run: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.#runner.run(transaction, run);
  }
}

/** The scope used by all `Sequelize` instances. */
export const transactionScope = new TransactionScope();
