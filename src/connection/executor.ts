import {
  Client as PgClient,
  Pool,
  types,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from 'pg';
import { CopyFromStdin } from './copy.ts';
import { ConnectionAcquireTimeoutError } from '../errors/errors.ts';
import { mapConnectionError, mapQueryError } from '../errors/map-pg-error.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { LoggingFunction } from './options.ts';

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
  logging?: LoggingFunction | false;
  benchmark?: boolean;
  transactionId?: string;
}>;

/** Runs a compiled query and maps driver errors to Sequelize v6 error classes. */
export type Executor = (query: CompiledQuery, options?: ExecuteOptions) => Promise<QueryResult>;

/** Owner of connections: acquires clients for transactions and closes the pool. */
export type ConnectionManager = Readonly<{
  execute: Executor;
  acquire: () => Promise<Client>;
  /** Streams `lines` into `COPY ... FROM STDIN`; resolves with the copied row count. */
  copyFrom: (
    text: string,
    lines: AsyncIterable<string>,
    options?: ExecuteOptions,
  ) => Promise<number>;
  /** Opens a dedicated (non-pooled) client, e.g. for LISTEN. */
  dedicated: () => Promise<PgClient>;
  close: () => Promise<void>;
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

const isAcquireTimeout = (error: unknown): boolean =>
  error instanceof Error && /timeout exceeded when trying to connect/i.test(error.message);

const log = (
  query: CompiledQuery,
  options: ExecuteOptions,
  defaults: ExecuteOptions,
  elapsed: number,
): void => {
  const logging = options.logging ?? defaults.logging;
  if (logging === false || logging === undefined) {
    return;
  }
  const sql = `Executing (${options.transactionId ?? 'default'}): ${query.text}`;
  if (options.benchmark ?? defaults.benchmark) {
    logging(sql.replace('Executing', 'Executed'), elapsed);
  } else {
    logging(sql, { bind: query.values });
  }
};

const acquireWith = async (pool: Pool): Promise<PoolClient> => {
  try {
    return await pool.connect();
  } catch (error) {
    throw isAcquireTimeout(error)
      ? new ConnectionAcquireTimeoutError(error instanceof Error ? error : new Error(String(error)))
      : mapConnectionError(error);
  }
};

/** Creates a connection manager over a `pg` pool. */
export const createConnectionManager = (
  config: PoolConfig,
  defaults: ExecuteOptions,
): ConnectionManager => {
  const pool = new Pool({ ...config, types: typeParsers });
  pool.on('error', () => {});

  const execute: Executor = async (query, options = {}) => {
    const client = options.client ?? (await acquireWith(pool));
    const started = performance.now();
    try {
      const result = await client.query({ text: query.text, values: [...query.values] });
      log(query, options, defaults, performance.now() - started);
      return { rows: result.rows, rowCount: result.rowCount ?? 0, command: result.command };
    } catch (error) {
      throw mapQueryError(error, { sql: query.text, parameters: query.values });
    } finally {
      if (options.client === undefined) {
        client.release();
      }
    }
  };

  const copyFrom = async (
    text: string,
    lines: AsyncIterable<string>,
    options: ExecuteOptions = {},
  ): Promise<number> => {
    const client = options.client ?? (await acquireWith(pool));
    const started = performance.now();
    const copy = new CopyFromStdin(text, lines);
    const done = copy.done();
    try {
      void (
        client as unknown as Readonly<{ query: (submittable: CopyFromStdin) => unknown }>
      ).query(copy);
      const rowCount = await done;
      log({ text, values: [] }, options, defaults, performance.now() - started);
      return rowCount;
    } catch (error) {
      throw mapQueryError(error, { sql: text, parameters: [] });
    } finally {
      await copy.settled();
      if (options.client === undefined) {
        client.release();
      }
    }
  };

  const dedicated = async (): Promise<PgClient> => {
    const client = new PgClient({ ...config, types: typeParsers });
    try {
      await client.connect();
    } catch (error) {
      throw mapConnectionError(error);
    }
    return client;
  };

  return {
    execute,
    acquire: () => acquireWith(pool),
    copyFrom,
    dedicated,
    close: () => pool.end(),
  };
};
