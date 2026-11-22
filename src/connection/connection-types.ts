import type { PoolClient, QueryResultRow } from 'pg';
import type { LoggingFunction } from './options.ts';

/** Result of one executed statement. */
export type QueryResult = Readonly<{
  rows: readonly QueryResultRow[];
  rowCount: number;
  command: string;
}>;

/** Database client a query runs on: a pool connection held by a transaction. */
export type Client = Pick<PoolClient, 'query' | 'release'>;

/**
 * Connection that `sequelize.connectionManager.getConnection()` hands out and
 * `releaseConnection()` takes back: the pooled `pg` client of the instance that owns it.
 */
export type Connection = Client;

/**
 * Options of `sequelize.connectionManager.getConnection()` (Sequelize v6 `GetConnectionOptions`).
 *
 * @example
 * ```ts
 * const options: GetConnectionOptions = { type: 'read', useMaster: false };
 * const connection = await sequelize.connectionManager.getConnection(options);
 * await sequelize.connectionManager.releaseConnection(connection);
 * ```
 */
export type GetConnectionOptions = Readonly<{
  /** `'read'` takes a read replica when one is configured. Default `'write'`. */
  type?: 'read' | 'write';
  /** Forces the writer even when `type` is `'read'`. */
  useMaster?: boolean;
  /** Transaction id the connection is acquired for; informational (v6 passes it for transactions). */
  uuid?: string;
}>;

/**
 * Acquire / release contract of `sequelize.connectionManager`. Every query, transaction, COPY and
 * `sync` of the instance takes its pooled connection through `getConnection` and gives it back
 * through `releaseConnection`, looked up on the manager at call time: both may be replaced on the
 * instance (wrapped) to route connections.
 *
 * @example
 * ```ts
 * const manager = sequelize.connectionManager;
 * const defaultGet = manager.getConnection.bind(manager);
 * manager.getConnection = async (options) => {
 *   console.log('acquiring', options?.type ?? 'write');
 *   return defaultGet(options);
 * };
 * ```
 */
export interface ConnectionManagerContract {
  /**
   * Acquires a pooled connection.
   *
   * @param options - Replica selection and transaction id.
   * @returns A connection that stays checked out until it is passed to `releaseConnection`.
   *
   * @example
   * ```ts
   * const connection = await sequelize.connectionManager.getConnection({ type: 'read' });
   * await sequelize.connectionManager.releaseConnection(connection);
   * ```
   */
  getConnection(options?: GetConnectionOptions): Promise<Connection>;
  /**
   * Returns a connection obtained from `getConnection` to the pool that owns it.
   *
   * @param connection - Connection to release.
   * @returns Nothing (may be asynchronous).
   *
   * @example
   * ```ts
   * const connection = await sequelize.connectionManager.getConnection();
   * await connection.query('SELECT 1');
   * await sequelize.connectionManager.releaseConnection(connection);
   * ```
   */
  releaseConnection(connection: Connection): Promise<void> | void;
}

/** Per-call execution settings. */
export type ExecuteOptions = Readonly<{
  client?: Client;
  /** Run on a read replica when one is configured (ignored when `client` is set). */
  route?: 'read' | 'write';
  logging?: LoggingFunction | false;
  benchmark?: boolean;
  /** `statement_timeout` in milliseconds for this query only (`0` disables it). */
  statementTimeout?: number;
  transactionId?: string;
}>;
