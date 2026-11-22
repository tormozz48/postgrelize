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
 * Live connection counts of a pool (Sequelize v6 `sequelize-pool` `Pool`). Every property is read
 * at access time, so a health gauge can keep one reference. Reading never opens a connection:
 * all counters are `0` before the first query.
 *
 * @example
 * ```ts
 * const { size, available, using, waiting, maxSize } = sequelize.connectionManager.pool;
 * console.log(`${using}/${maxSize} in use, ${waiting} waiting, ${available} idle of ${size}`);
 * ```
 */
export interface PoolCounters {
  /** Open connections, idle and checked out (`totalCount` of the `pg` pool). */
  readonly size: number;
  /** Idle connections ready to be handed out (`idleCount`). */
  readonly available: number;
  /** Checked out connections: `size - available`. */
  readonly using: number;
  /** Acquisitions waiting for a free connection (`waitingCount`). */
  readonly waiting: number;
  /** Configured `pool.max` (the `pg` default of 10 when unset). */
  readonly maxSize: number;
}

/**
 * `sequelize.connectionManager.pool`: {@link PoolCounters} of the whole instance. With
 * `replication` configured the counters are the sums over the writer pool and every replica pool
 * (v6 has no totals there, it has a separate `read` and `write` pool), and `read` / `write` give
 * the counters of each side. `read` sums all replicas. Without replication `read` and `write`
 * are `undefined`.
 *
 * @example
 * ```ts
 * const { write, read } = sequelize.connectionManager.pool;
 * console.log(write?.using, read?.using);
 * ```
 */
export interface ConnectionPool extends PoolCounters {
  /** Counters of the writer pool; only with `replication`. */
  readonly write: PoolCounters | undefined;
  /** Counters of all read replica pools together; only with `replication`. */
  readonly read: PoolCounters | undefined;
}

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
  /**
   * `'read'` takes a read replica when one is configured. Default `'write'`. `'SELECT'` is the same as
   * `'read'` (v6 passes the query type of a SELECT there).
   */
  type?: 'read' | 'write' | 'SELECT';
  /** Forces the writer even when `type` is `'read'`. postgrelize extension. */
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
  /**
   * Removes a broken connection from the pool that owns it instead of returning it: the client is
   * closed and the pool opens a replacement when one is needed. The connection must not be used or
   * released afterwards (a later release is ignored).
   *
   * @param connection - Connection obtained from `getConnection`.
   * @returns Resolves when the connection is removed from its pool.
   *
   * @example
   * ```ts
   * const connection = await sequelize.connectionManager.getConnection({ type: 'read' });
   * try {
   *   await connection.query('SELECT 1');
   *   await sequelize.connectionManager.releaseConnection(connection);
   * } catch (error) {
   *   await sequelize.connectionManager.destroyConnection(connection);
   *   throw error;
   * }
   * ```
   */
  destroyConnection(connection: Connection): Promise<void>;
  /**
   * Live connection counts of the instance's pools, for health gauges.
   *
   * @example
   * ```ts
   * const { size, using, waiting, maxSize } = sequelize.connectionManager.pool;
   * ```
   */
  readonly pool: ConnectionPool;
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
