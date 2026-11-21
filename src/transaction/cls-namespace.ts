import type { Transaction } from './transaction.ts';

/**
 * Continuation-local namespace in the shape of `cls-hooked` / `continuation-local-storage`
 * (the namespace passed to Sequelize v6 `useCLS`). Only these members are used.
 */
export type ClsNamespace = Readonly<{
  bind: (...args: never[]) => unknown;
  run: (callback: (context?: unknown) => unknown) => unknown;
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => unknown;
}>;

const KEY = 'transaction';

/**
 * Keeps the current transaction under the `transaction` key of a CLS namespace, as Sequelize v6 does:
 * managed transactions run in `namespace.run` and set the key, queries without a `transaction` option
 * read it, and finishing a transaction clears it. Project code can also place a transaction there.
 */
export class NamespaceContext {
  readonly #namespace: ClsNamespace;

  /**
   * @param namespace - Namespace given to `Sequelize.useCLS`.
   * @throws Error when it is not a CLS namespace (has no `bind` and `run`), like v6.
   */
  constructor(namespace: unknown) {
    const candidate = namespace as Partial<ClsNamespace> | null | undefined;
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof candidate.bind !== 'function' ||
      typeof candidate.run !== 'function'
    ) {
      throw new Error('Must provide CLS namespace');
    }
    this.#namespace = candidate as ClsNamespace;
  }

  /**
   * Transaction stored in the namespace of the current context.
   *
   * @returns The transaction, or `undefined` when none is stored (or it was cleared).
   */
  current(): Transaction | undefined {
    return (this.#namespace.get(KEY) as Transaction | null | undefined) ?? undefined;
  }

  /**
   * Runs `run` in a new namespace context with `transaction` stored in it.
   *
   * @param transaction - Transaction to store.
   * @param run - Callback.
   * @returns Result of `run`.
   */
  run<T>(transaction: Transaction, run: () => Promise<T>): Promise<T> {
    let result: Promise<T> | undefined;
    this.#namespace.run(() => {
      this.#namespace.set(KEY, transaction);
      result = run();
    });
    return result as Promise<T>;
  }

  /**
   * Clears the stored transaction when it is the one that finished (not for savepoints, as in v6).
   *
   * @param transaction - Finished transaction.
   */
  release(transaction: Transaction): void {
    if (transaction.parent === undefined && this.#namespace.get(KEY) === transaction) {
      this.#namespace.set(KEY, null);
    }
  }
}
