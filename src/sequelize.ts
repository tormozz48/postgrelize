import { DataTypes } from './data-types/data-types.ts';
import { cast, col, fn, json, literal, where } from './expressions/methods.ts';
import { Op } from './expressions/op.ts';
import { Model } from './model/model.ts';
import { QueryTypes } from './query/query-result-shaper.ts';
import { SequelizeBase } from './sequelize/sequelize-base.ts';
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

/**
 * Entry point, API-compatible with Sequelize v6 `Sequelize` for PostgreSQL.
 *
 * @example
 * ```ts
 * const sequelize = new Sequelize('postgres://user:pass@localhost:5432/app', { logging: false });
 * ```
 */
export class Sequelize extends SequelizeMembers {
  /** Column types. */
  static readonly DataTypes = DataTypes;
  /** Query operators. */
  static readonly Op: typeof Op = Op;
  /** Query types. */
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
   * transaction automatically. The namespace argument of Sequelize v6 is accepted and ignored;
   * `AsyncLocalStorage` is used instead.
   *
   * @param _namespace - Ignored.
   * @returns The `Sequelize` class.
   */
  static useCLS(_namespace?: unknown): typeof Sequelize {
    transactionScope.enableCls();
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
  constructor(...args: readonly unknown[]) {
    super(...args);
  }
}
