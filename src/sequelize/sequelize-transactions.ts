import type {
  AdvisoryLockKey,
  Transaction,
  TransactionOptions,
} from '../transaction/transaction.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

/**
 * Transaction methods of `Sequelize`: `transaction` and `withAdvisoryLock`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeTransactions = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class TransactionsCapability extends Base {
    /**
     * Starts an unmanaged transaction; commit or roll it back yourself.
     *
     * @param options - Transaction options.
     * @returns Started transaction.
     */
    transaction(options?: TransactionOptions): Promise<Transaction>;
    /**
     * Runs `run` in a managed transaction: committed when it resolves, rolled back when it throws.
     *
     * @param run - Callback receiving the transaction.
     * @returns Result of `run`.
     */
    transaction<T>(run: (transaction: Transaction) => Promise<T>): Promise<T>;
    /**
     * Runs `run` in a managed transaction with options.
     *
     * @param options - Transaction options.
     * @param run - Callback receiving the transaction.
     * @returns Result of `run`.
     */
    transaction<T>(
      options: TransactionOptions,
      run: (transaction: Transaction) => Promise<T>,
    ): Promise<T>;
    async transaction<T>(
      optionsOrRun?: TransactionOptions | ((transaction: Transaction) => Promise<T>),
      maybeRun?: (transaction: Transaction) => Promise<T>,
    ): Promise<T | Transaction> {
      const options = typeof optionsOrRun === 'function' ? {} : (optionsOrRun ?? {});
      const run = typeof optionsOrRun === 'function' ? optionsOrRun : maybeRun;
      return run === undefined
        ? this.internals.begin(options)
        : this.internals.managed(options, run);
    }

    /**
     * Runs `run` in a transaction holding a transaction-level advisory lock. PostgreSQL extension.
     *
     * @param key - Lock key (integer or string).
     * @param run - Callback receiving the transaction.
     * @param options - Transaction options.
     * @returns Result of `run`.
     */
    withAdvisoryLock<T>(
      key: AdvisoryLockKey,
      run: (transaction: Transaction) => Promise<T>,
      options: TransactionOptions = {},
    ): Promise<T> {
      return this.transaction(options, async (transaction) => {
        await transaction.advisoryLock(key);
        return run(transaction);
      });
    }
  };
