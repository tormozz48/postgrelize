import { DataTypes } from './data-types/data-types.ts';
import { cast, col, fn, json, literal, where } from './expressions/methods.ts';
import { Op } from './expressions/op.ts';
import { Model } from './model/model.ts';
import type { RuntimeOwner } from './model/runtime.ts';
import { QueryTypes } from './query/query-result-shaper.ts';
import { SequelizeBase } from './sequelize/sequelize-base.ts';
import type { InstanceHookAdders } from './sequelize/instance-hook-adders.ts';
import { SequelizeHooks } from './sequelize/sequelize-hooks.ts';
import { SequelizeNotifications } from './sequelize/sequelize-notifications.ts';
import { SequelizeSchema } from './sequelize/sequelize-schema.ts';
import { SequelizeTransactions } from './sequelize/sequelize-transactions.ts';
import type { SequelizeOptions } from './connection/options.ts';
import { Transaction } from './transaction/transaction.ts';
import { transactionScope } from './transaction/transaction-runner.ts';

export { QueryTypes } from './query/query-result-shaper.ts';
export type { QueryOptions, QueryType } from './query/query-result-shaper.ts';
export type { DefineOptions } from './sequelize/sequelize-base.ts';

const SequelizeMembers = SequelizeNotifications(
  SequelizeTransactions(SequelizeSchema(SequelizeHooks(SequelizeBase))),
);

// Declaration files cannot name the symbol key of a class member, so `RuntimeOwner` is merged in as an interface.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- intentional merge.
export interface Sequelize extends RuntimeOwner, InstanceHookAdders {}

/**
 * Entry point, API-compatible with Sequelize v6 `Sequelize` for PostgreSQL.
 *
 * @example
 * ```ts
 * const sequelize = new Sequelize('postgres://user:pass@localhost:5432/app', { logging: false });
 * ```
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- see the interface above.
export class Sequelize extends SequelizeMembers {
  /** Column types. */
  static readonly DataTypes = DataTypes;
  /** Query operators. */
  static readonly Op: typeof Op = Op;
  /** Result shapes accepted by the `type` option of {@link Sequelize.query}, e.g. `QueryTypes.SELECT`. */
  static readonly QueryTypes = QueryTypes;
  /** Transaction class. */
  static readonly Transaction = Transaction;
  /** Model base class. */
  static readonly Model = Model;
  /** Raw SQL fragment builder. */
  static readonly literal = literal;
  /** SQL function call builder. */
  static readonly fn = fn;
  /** Column reference builder. */
  static readonly col = col;
  /** Type cast builder. */
  static readonly cast = cast;
  /** Comparison builder. */
  static readonly where = where;
  /** JSON path builder. */
  static readonly json = json;

  /**
   * Enables continuation-local transactions: queries inside `sequelize.transaction(fn)` use the
   * transaction automatically. Without an argument `AsyncLocalStorage` is used. With a `cls-hooked`
   * style namespace (an object with `bind`, `run`, `get` and `set`) it behaves as in Sequelize v6:
   * managed transactions run in `namespace.run` and store themselves under `namespace.get('transaction')`
   * (cleared when they finish), queries without a `transaction` option read the key, and a nested
   * `sequelize.transaction(callback)` opens its own transaction instead of a savepoint.
   *
   * @param namespace - CLS namespace; `AsyncLocalStorage` when omitted.
   * @returns The `Sequelize` class.
   * @throws Error `Must provide CLS namespace` when `namespace` has no `bind` or `run`.
   * @see {@link Sequelize.transaction}
   *
   * @example
   * ```ts
   * Sequelize.useCLS();
   * await sequelize.transaction(async () => {
   *   // No `{ transaction }` option needed: the queries join the managed transaction.
   *   const user = await User.create({ name: 'Ada' });
   *   await Post.create({ title: 'Hello', userId: user.id });
   * });
   * ```
   */
  static useCLS(namespace?: unknown): typeof Sequelize {
    transactionScope.enableCls(namespace);
    return Sequelize;
  }

  /**
   * Creates an instance from a connection URI.
   *
   * @param uri - `postgres://user:password@host:port/database`.
   * @param options - Options.
   */
  constructor(uri: string, options?: SequelizeOptions);
  /**
   * Creates an instance from connection parameters.
   *
   * @param database - Database name.
   * @param username - User name.
   * @param password - Password.
   * @param options - Options.
   */
  constructor(
    database: string,
    username?: string | null,
    password?: string | null,
    options?: SequelizeOptions,
  );
  /**
   * Creates an instance from options only.
   *
   * @param options - Options including connection settings.
   */
  constructor(options?: SequelizeOptions);
  // oxlint-disable-next-line no-useless-constructor -- re-declares the typed overloads that mixin construction would erase.
  constructor(...args: readonly unknown[]) {
    super(...args);
  }
}
