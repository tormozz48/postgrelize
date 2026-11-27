import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from '../../transaction/transaction.ts';

/**
 * Runs work that opens savepoints one call at a time per transaction: concurrent savepoints on its
 * one connection would nest into each other and abort the transaction.
 *
 * @internal
 */
export class TransactionQueue {
  readonly #tails = new WeakMap<Transaction, Promise<unknown>>();
  // a call made from inside the queued work (a hook) must not wait for itself
  readonly #holding = new AsyncLocalStorage<ReadonlySet<Transaction>>();

  /**
   * @param transaction - Transaction of the caller.
   * @param work - Work to run after the earlier work of the transaction settled.
   * @returns The result of `work`.
   */
  run<T>(transaction: Transaction, work: () => Promise<T>): Promise<T> {
    const held = this.#holding.getStore();
    if (held?.has(transaction) === true) {
      return work();
    }
    const next = (): Promise<T> => this.#holding.run(new Set([...(held ?? []), transaction]), work);
    const result = (this.#tails.get(transaction) ?? Promise.resolve()).then(next, next);
    this.#tails.set(
      transaction,
      result.catch(() => undefined),
    );
    return result;
  }
}
