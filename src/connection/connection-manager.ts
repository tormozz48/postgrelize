import { Client as PgClient, Pool, types, type PoolClient, type PoolConfig } from 'pg';
import { hookFailures } from './after-connect-hook.ts';
import { CopyRunner } from './copy-runner.ts';
import type {
  Client,
  Connection,
  ConnectionManagerContract,
  ConnectionPool,
  ExecuteOptions,
  GetConnectionOptions,
  QueryResult,
} from './connection-types.ts';
import { ConnectionAcquireTimeoutError } from '../errors/errors.ts';
import type { PgErrorMapper } from '../errors/map-pg-error.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { QueryLogger } from './query-logger.ts';
import { ManagerPools } from './pool-counters.ts';
import { ReplicaRouter } from './replica-router.ts';
import { StatementTimeout } from './statement-timeout.ts';
import { StatementCache, type StatementClient } from './statement-cache.ts';
import type { StatementCacheOptions } from './options.ts';

export type {
  Client,
  Connection,
  ConnectionManagerContract,
  ConnectionPool,
  ExecuteOptions,
  GetConnectionOptions,
  PoolCounters,
  QueryResult,
} from './connection-types.ts';

const DATE_OID = 1082;
const INTERVAL_OID = 1186;
const RAW_TEXT_OIDS: ReadonlySet<number> = new Set([DATE_OID, INTERVAL_OID]);

const typeParsers: NonNullable<PoolConfig['types']> = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    RAW_TEXT_OIDS.has(oid) && format !== 'binary'
      ? (value: string) => value
      : types.getTypeParser(oid, format)) as NonNullable<PoolConfig['types']>['getTypeParser'],
};

/**
 * Owner of the `pg` pools of a `Sequelize` instance: runs queries (mapping driver errors to Sequelize v6
 * error classes), acquires clients for transactions, streams COPY data and closes the pools.
 */
export class ConnectionManager implements ConnectionManagerContract {
  readonly #config: PoolConfig;
  readonly #router: ReplicaRouter<Pool>;
  readonly #logger: QueryLogger;
  readonly #errors: PgErrorMapper;
  readonly #copies: CopyRunner;
  readonly #statements: StatementCache | undefined;
  readonly #timeouts = new StatementTimeout();
  #counters: ManagerPools | undefined;

  /**
   * @param config - Writer pool configuration.
   * @param readConfigs - Read replica pool configurations.
   * @param logger - Logger of executed statements.
   * @param errors - Driver error mapper.
   * @param statementCache - Named prepared statement settings; unnamed statements when absent.
   */
  constructor(
    config: PoolConfig,
    readConfigs: readonly PoolConfig[],
    logger: QueryLogger,
    errors: PgErrorMapper,
    statementCache?: boolean | StatementCacheOptions,
  ) {
    this.#config = config;
    this.#logger = logger;
    this.#errors = errors;
    this.#statements =
      statementCache === undefined || statementCache === false
        ? undefined
        : new StatementCache(statementCache);
    this.#copies = this.#copyRunner();
    this.#router = new ReplicaRouter(
      ConnectionManager.#pool(config),
      readConfigs.map((readConfig) => ConnectionManager.#pool(readConfig)),
    );
  }

  /**
   * Live connection counts of the pools (Sequelize v6 `connectionManager.pool`); see
   * {@link ConnectionPool}.
   *
   * @example
   * ```ts
   * const { using, maxSize } = sequelize.connectionManager.pool;
   * ```
   */
  get pool(): ConnectionPool {
    this.#counters ??= new ManagerPools(this.#router.writer, this.#router.readers);
    return this.#counters;
  }

  /**
   * Runs a compiled query and maps driver errors to Sequelize v6 error classes.
   *
   * @param query - Query text and parameters.
   * @param options - Client, route and logging settings.
   * @returns Rows, row count and command.
   */
  async execute(query: CompiledQuery, options: ExecuteOptions = {}): Promise<QueryResult> {
    const client =
      options.client ??
      (await this.getConnection({ type: options.route === 'read' ? 'read' : 'write' }));
    const logged = this.#logger.enabled(options);
    const started = logged ? performance.now() : 0;
    try {
      const result = await this.#send(client, query, options);
      if (logged) {
        this.#logger.log(query, options, performance.now() - started);
      }
      return { rows: result.rows, rowCount: result.rowCount ?? 0, command: result.command };
    } catch (error) {
      throw this.#errors.mapQueryError(error, { sql: query.text, parameters: query.values });
    } finally {
      if (options.client === undefined) {
        await this.releaseConnection(client);
      }
    }
  }

  /**
   * Acquires a pooled connection: the writer, or the next read replica for `type: 'read'` when
   * replicas are configured and `useMaster` is not set. Every acquisition of the instance goes
   * through this method, looked up on the manager at call time, so it can be replaced to route
   * connections (Sequelize v6 `connectionManager.getConnection`).
   *
   * @param options - Replica selection and transaction id.
   * @returns Pooled client; pass it to {@link ConnectionManager.releaseConnection} when done.
   * @throws ConnectionAcquireTimeoutError when the pool is exhausted for `pool.acquire` milliseconds.
   * @throws ConnectionError and its subclasses when a connection cannot be opened.
   *
   * @example
   * ```ts
   * const manager = sequelize.connectionManager;
   * const connection = await manager.getConnection({ type: 'write' });
   * try {
   *   await connection.query('SELECT 1');
   * } finally {
   *   await manager.releaseConnection(connection);
   * }
   * ```
   */
  getConnection(options: GetConnectionOptions = {}): Promise<Connection> {
    const read =
      (options.type === 'read' || options.type === 'SELECT') && options.useMaster !== true;
    return this.#acquire(this.#router.pool(read ? 'read' : 'write'));
  }

  /**
   * Returns a connection to the pool that owns it (Sequelize v6 `connectionManager.releaseConnection`).
   * A connection obtained from another instance's manager is released to that instance's pool.
   *
   * @param connection - Connection obtained from `getConnection`.
   * @returns Nothing.
   *
   * @example
   * ```ts
   * const connection = await sequelize.connectionManager.getConnection();
   * await sequelize.connectionManager.releaseConnection(connection);
   * ```
   */
  releaseConnection(connection: Connection): void {
    connection.release();
  }

  /**
   * Removes a connection from the pool that owns it without returning it (Sequelize v6
   * `connectionManager.destroyConnection`): the client is closed and the pool opens a replacement
   * on demand. Destroying a connection that was already released or destroyed is ignored.
   *
   * @param connection - Connection obtained from `getConnection`.
   * @returns Resolves when the connection is removed.
   *
   * @example
   * ```ts
   * const connection = await sequelize.connectionManager.getConnection();
   * await sequelize.connectionManager.destroyConnection(connection);
   * ```
   */
  async destroyConnection(connection: Connection): Promise<void> {
    connection.release(true);
  }

  /**
   * Streams `lines` into `COPY ... FROM STDIN`.
   *
   * @param text - `COPY ... FROM STDIN` statement.
   * @param lines - Encoded rows.
   * @param options - Client and logging settings.
   * @returns Copied row count.
   */
  async copyFrom(
    text: string,
    lines: AsyncIterable<string>,
    options: ExecuteOptions = {},
  ): Promise<number> {
    return this.#copies.from(text, lines, options);
  }

  /**
   * Runs `COPY ... TO STDOUT` and yields the output chunks.
   *
   * @param text - `COPY ... TO STDOUT` statement.
   * @param options - Client and logging settings.
   * @returns Async iterator of output chunks.
   */
  async *copyTo(
    text: string,
    options: ExecuteOptions = {},
  ): AsyncGenerator<Buffer, void, undefined> {
    yield* this.#copies.to(text, options);
  }

  /**
   * Opens a dedicated (non-pooled) client, e.g. for LISTEN.
   *
   * @returns Connected client.
   */
  async dedicated(): Promise<PgClient> {
    const client = new PgClient({ ...this.#config, types: typeParsers });
    try {
      await client.connect();
    } catch (error) {
      throw this.#errors.mapConnectionError(error);
    }
    return client;
  }

  /**
   * Closes the writer and reader pools.
   *
   * @returns Resolves when all pools are closed.
   */
  async close(): Promise<void> {
    await Promise.all([
      this.#router.writer.end(),
      ...this.#router.readers.map((reader) => reader.end()),
    ]);
  }

  #copyRunner(): CopyRunner {
    return new CopyRunner(
      () => this.getConnection({ type: 'write' }),
      (client) => this.releaseConnection(client),
      this.#logger,
      this.#errors,
    );
  }

  #send(
    client: Client,
    query: CompiledQuery,
    options: ExecuteOptions,
  ): ReturnType<StatementClient['query']> {
    const run = (): ReturnType<StatementClient['query']> =>
      this.#statements === undefined
        ? client.query({ text: query.text, values: query.values as unknown[] })
        : this.#statements.run(client, query, options.client === undefined);
    return options.statementTimeout === undefined
      ? run()
      : this.#timeouts.run(client, options.client !== undefined, options.statementTimeout, run);
  }

  async #acquire(pool: Pool): Promise<PoolClient> {
    try {
      return ConnectionManager.#guard(await pool.connect());
    } catch (error) {
      if (hookFailures.has(error as object)) {
        throw error;
      }
      throw ConnectionManager.#isAcquireTimeout(error)
        ? new ConnectionAcquireTimeoutError(
            error instanceof Error ? error : new Error(String(error)),
          )
        : this.#errors.mapConnectionError(error);
    }
  }

  static #guard(client: PoolClient): PoolClient {
    let broken: Error | undefined;
    const onError = (error: Error): void => {
      broken = error;
    };
    client.on('error', onError);
    const release = client.release.bind(client);
    let released = false;
    // Releasing twice is a no-op: a routing wrapper written as `owner?.release(c) ?? defaultRelease(c)`
    // calls both, because v6 style `releaseConnection` returns nothing.
    client.release = (error?: Error | boolean): void => {
      if (released) {
        return;
      }
      released = true;
      client.removeListener('error', onError);
      release(error ?? broken);
    };
    return client;
  }

  static #pool(config: PoolConfig): Pool {
    const pool = new Pool({ ...config, types: typeParsers });
    pool.on('error', () => {});
    return pool;
  }

  static #isAcquireTimeout(error: unknown): boolean {
    return error instanceof Error && /timeout exceeded when trying to connect/i.test(error.message);
  }
}
