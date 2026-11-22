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
     * Begins an unmanaged transaction that you must commit or roll back yourself. With `options.transaction` it becomes a savepoint inside that transaction.
     *
     * @param options - Transaction options.
     * @returns Started transaction.
     *
     * @example
     * ```ts
     * const t = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE });
     * try {
     *   await User.create({ name: 'Ada' }, { transaction: t });
     *   await t.commit();
     * } catch (error) {
     *   await t.rollback();
     *   throw error;
     * }
     * ```
     */
    transaction(options?: TransactionOptions): Promise<Transaction>;
    /**
     * Runs a callback in a managed transaction: committed when it resolves, rolled back when it throws. Queries must pass `{ transaction }` unless CLS is enabled with {@link Sequelize.useCLS}.
     *
     * @param run - Callback receiving the transaction.
     * @returns Result of `run`.
     *
     * @example
     * ```ts
     * const created = await sequelize.transaction(async (t) => {
     *   const owner = await User.create({ name: 'Ada' }, { transaction: t });
     *   return Post.create({ title: 'Hello', userId: owner.id }, { transaction: t });
     * });
     * ```
     */
    transaction<T>(run: (transaction: Transaction) => Promise<T>): Promise<T>;
    /**
     * Runs a callback in a managed transaction started with the given options (isolation level, read only, settings, savepoint parent).
     *
     * @param options - Transaction options.
     * @param run - Callback receiving the transaction.
     * @returns Result of `run`.
     *
     * @example
     * ```ts
     * const count = await sequelize.transaction({ readOnly: true }, async (t) => {
     *   return User.count({ transaction: t });
     * });
     * ```
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
     * Runs a callback in a managed transaction that first takes a transaction-level advisory lock, so concurrent callers with the same key run one at a time. The lock is released when the transaction ends. PostgreSQL extension.
     *
     * @postgrelize
     * @param key - Lock key (integer or string).
     * @param run - Callback receiving the transaction.
     * @param options - Transaction options.
     * @returns Result of `run`.
     *
     * @example
     * ```ts
     * await sequelize.withAdvisoryLock('nightly-report', async (t) => {
     *   await Invoice.update({ status: 'sent' }, { where: { status: 'ready' }, transaction: t });
     * });
     * ```
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
