import { Client as PgClient, Pool, types, type PoolClient, type PoolConfig } from 'pg';
import { CopyRunner } from './copy-runner.ts';
import type { Client, ExecuteOptions, QueryResult } from './connection-types.ts';
import { ConnectionAcquireTimeoutError } from '../errors/errors.ts';
import type { PgErrorMapper } from '../errors/map-pg-error.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { QueryLogger } from './query-logger.ts';
import { ReplicaRouter } from './replica-router.ts';

export type { Client, ExecuteOptions, QueryResult } from './connection-types.ts';

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
export class ConnectionManager {
  readonly #config: PoolConfig;
  readonly #router: ReplicaRouter<Pool>;
  readonly #logger: QueryLogger;
  readonly #errors: PgErrorMapper;
  readonly #copies: CopyRunner;

  /**
   * @param config - Writer pool configuration.
   * @param readConfigs - Read replica pool configurations.
   * @param logger - Logger of executed statements.
   * @param errors - Driver error mapper.
   */
  constructor(
    config: PoolConfig,
    readConfigs: readonly PoolConfig[],
    logger: QueryLogger,
    errors: PgErrorMapper,
  ) {
    this.#config = config;
    this.#logger = logger;
    this.#errors = errors;
    this.#copies = new CopyRunner(() => this.acquire(), logger, errors);
    this.#router = new ReplicaRouter(
      ConnectionManager.#pool(config),
      readConfigs.map((readConfig) => ConnectionManager.#pool(readConfig)),
    );
  }

  /**
   * Runs a compiled query and maps driver errors to Sequelize v6 error classes.
   *
   * @param query - Query text and parameters.
   * @param options - Client, route and logging settings.
   * @returns Rows, row count and command.
   */
  async execute(query: CompiledQuery, options: ExecuteOptions = {}): Promise<QueryResult> {
    const client = options.client ?? (await this.#acquire(this.#router.pool(options.route)));
    const logged = this.#logger.enabled(options);
    const started = logged ? performance.now() : 0;
    try {
      const result = await client.query({ text: query.text, values: query.values as unknown[] });
      if (logged) {
        this.#logger.log(query, options, performance.now() - started);
      }
      return { rows: result.rows, rowCount: result.rowCount ?? 0, command: result.command };
    } catch (error) {
      throw this.#errors.mapQueryError(error, { sql: query.text, parameters: query.values });
    } finally {
      if (options.client === undefined) {
        client.release();
      }
    }
  }

  /**
   * Acquires a writer connection (e.g. for a transaction); release it when done.
   *
   * @returns Pooled client.
   */
  acquire(): Promise<Client> {
    return this.#acquire(this.#router.writer);
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

  async #acquire(pool: Pool): Promise<PoolClient> {
    try {
      return ConnectionManager.#guard(await pool.connect());
    } catch (error) {
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
    client.release = (error?: Error | boolean): void => {
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
