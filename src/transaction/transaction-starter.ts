import type { ConnectionManager } from '../connection/connection-manager.ts';
import { Transaction, type TransactionOptions } from './transaction.ts';
import { transactionScope } from './transaction-runner.ts';

/** Creates transactions on a connection manager, nesting them in the CLS transaction when enabled. */
export class TransactionStarter {
  readonly #connections: ConnectionManager;

  /**
   * @param connections - Connection manager of the owning `Sequelize` instance.
   */
  constructor(connections: ConnectionManager) {
    this.#connections = connections;
  }

  /**
   * Starts an unmanaged transaction.
   *
   * @param options - Transaction options.
   * @returns Started transaction.
   */
  begin(options: TransactionOptions): Promise<Transaction> {
    return this.#create(options).begin();
  }

  /**
   * Runs `run` in a managed transaction: committed on success, rolled back on error.
   *
   * @param options - Transaction options.
   * @param run - Callback receiving the transaction.
   * @returns Result of `run`.
   */
  managed<T>(
    options: TransactionOptions,
    run: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return transactionScope.run(this.#create(options), run);
  }

  #create(options: TransactionOptions): Transaction {
    const parent =
      options.transaction === undefined ? transactionScope.active() : options.transaction;
    return new Transaction(this.#connections, {
      ...options,
      ...(parent === undefined ? {} : { transaction: parent }),
    });
  }
}
