import { AsyncLocalStorage } from 'node:async_hooks';
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

/**
 * Transaction scope shared by every `Sequelize` instance: the `useCLS` switch, the current
 * transaction of the async context and the managed-transaction runner.
 */
export class TransactionScope {
  readonly #context = new TransactionContext();
  readonly #runner = new TransactionRunner(this.#context);
  #cls = false;

  /** Enables continuation-local transactions. */
  enableCls(): void {
    this.#cls = true;
  }

  /**
   * Transaction of the current async context.
   *
   * @returns The transaction, or `undefined` when CLS is off or outside a managed transaction.
   */
  active(): Transaction | undefined {
    return this.#cls ? this.#context.current() : undefined;
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
