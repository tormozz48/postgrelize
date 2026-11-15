import {
  Client as PgClient,
  Pool,
  types,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from 'pg';
import { CopyFromStdin, CopyToStdout } from './copy.ts';
import { ConnectionAcquireTimeoutError } from '../errors/errors.ts';
import type { PgErrorMapper } from '../errors/map-pg-error.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { LoggingFunction } from './options.ts';
import type { QueryLogger } from './query-logger.ts';
import { ReplicaRouter } from './replica-router.ts';

/** Result of one executed statement. */
export type QueryResult = Readonly<{
  rows: readonly QueryResultRow[];
  rowCount: number;
  command: string;
}>;

/** Database client a query runs on: a pool connection held by a transaction. */
export type Client = Pick<PoolClient, 'query' | 'release'>;

/** Per-call execution settings. */
export type ExecuteOptions = Readonly<{
  client?: Client;
  /** Run on a read replica when one is configured (ignored when `client` is set). */
  route?: 'read' | 'write';
  logging?: LoggingFunction | false;
  benchmark?: boolean;
  transactionId?: string;
}>;

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
    const started = performance.now();
    try {
      const result = await client.query({ text: query.text, values: [...query.values] });
      this.#logger.log(query, options, performance.now() - started);
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
    const client = options.client ?? (await this.#acquire(this.#router.writer));
    const started = performance.now();
    const copy = new CopyFromStdin(text, lines);
    const done = copy.done();
    try {
      void (
        client as unknown as Readonly<{ query: (submittable: CopyFromStdin) => unknown }>
      ).query(copy);
      const rowCount = await done;
      this.#logger.log({ text, values: [] }, options, performance.now() - started);
      return rowCount;
    } catch (error) {
      throw this.#errors.mapQueryError(error, { sql: text, parameters: [] });
    } finally {
      await copy.settled();
      if (options.client === undefined) {
        client.release();
      }
    }
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
    const client = options.client ?? (await this.#acquire(this.#router.writer));
    const started = performance.now();
    const copy = new CopyToStdout(text);
    void (client as unknown as Readonly<{ query: (submittable: CopyToStdout) => unknown }>).query(
      copy,
    );
    let completed = false;
    try {
      yield* copy.chunks();
      await copy.done();
      completed = true;
      this.#logger.log({ text, values: [] }, options, performance.now() - started);
    } catch (error) {
      throw this.#errors.mapQueryError(error, { sql: text, parameters: [] });
    } finally {
      if (!completed) {
        copy.discard();
        await copy.done().catch(() => undefined);
      }
      if (options.client === undefined) {
        client.release();
      }
    }
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
      return await pool.connect();
    } catch (error) {
      throw ConnectionManager.#isAcquireTimeout(error)
        ? new ConnectionAcquireTimeoutError(
            error instanceof Error ? error : new Error(String(error)),
          )
        : this.#errors.mapConnectionError(error);
    }
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
