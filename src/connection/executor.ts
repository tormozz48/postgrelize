import {
  Client as PgClient,
  Pool,
  types,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from 'pg';
import { Effect, type Scope } from 'effect';
import { CopyFromStdin, CopyToStdout } from './copy.ts';
import {
  ConnectionAcquireTimeoutError,
  type BaseError,
  type ConnectionError,
} from '../errors/errors.ts';
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
  /** Run on a read replica when one is configured (ignored when `client` is set). */
  route?: 'read' | 'write';
  logging?: LoggingFunction | false;
  benchmark?: boolean;
  transactionId?: string;
}>;

/** Runs a compiled query and maps driver errors to Sequelize v6 error classes. */
export type Executor = (query: CompiledQuery, options?: ExecuteOptions) => Promise<QueryResult>;

/**
 * Effect programs of a connection manager. Failures are the Sequelize v6 error classes; pool clients
 * are released when the program ends, also on failure or interruption.
 */
export type ConnectionEffects = Readonly<{
  /** Runs a compiled query on `options.client` or on a pooled client. */
  execute: (
    query: CompiledQuery,
    options?: ExecuteOptions,
  ) => Effect.Effect<QueryResult, BaseError>;
  /** A pooled client of the primary, released when the surrounding scope closes. */
  client: Effect.Effect<Client, ConnectionError, Scope.Scope>;
  /** Streams `lines` into `COPY ... FROM STDIN`; succeeds with the copied row count. */
  copyFrom: (
    text: string,
    lines: AsyncIterable<string>,
    options?: ExecuteOptions,
  ) => Effect.Effect<number, BaseError>;
  /** Opens a dedicated (non-pooled) client, e.g. for LISTEN. */
  dedicated: Effect.Effect<PgClient, ConnectionError>;
  /** Ends all pools. */
  close: Effect.Effect<void>;
}>;

/** Owner of connections: acquires clients for transactions and closes the pool. */
export type ConnectionManager = Readonly<{
  /** The operations below as Effect programs. */
  effects: ConnectionEffects;
  execute: Executor;
  acquire: () => Promise<Client>;
  /** Streams `lines` into `COPY ... FROM STDIN`; resolves with the copied row count. */
  copyFrom: (
    text: string,
    lines: AsyncIterable<string>,
    options?: ExecuteOptions,
  ) => Promise<number>;
  /** Runs `COPY ... TO STDOUT` and yields the output chunks. */
  copyTo: (text: string, options?: ExecuteOptions) => AsyncGenerator<Buffer, void, undefined>;
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

const acquireError = (error: unknown): ConnectionError =>
  isAcquireTimeout(error)
    ? new ConnectionAcquireTimeoutError(error instanceof Error ? error : new Error(String(error)))
    : mapConnectionError(error);

const connect = (pool: Pool): Effect.Effect<PoolClient, ConnectionError> =>
  Effect.tryPromise({ try: () => pool.connect(), catch: acquireError });

/** A pooled client released when the scope closes. */
const scopedClient = (pool: Pool): Effect.Effect<Client, ConnectionError, Scope.Scope> =>
  Effect.acquireRelease(connect(pool), release);

/** `client` when given, else a scoped pooled client. */
const clientFor = (
  options: ExecuteOptions,
  pool: Pool,
): Effect.Effect<Client, ConnectionError, Scope.Scope> =>
  options.client === undefined ? scopedClient(pool) : Effect.succeed(options.client);

const release = (client: Client): Effect.Effect<void> => Effect.sync(() => client.release());

type Submittable = Readonly<{ query: (submittable: CopyFromStdin | CopyToStdout) => unknown }>;

/** Creates a connection manager over a `pg` pool. */
export const createConnectionManager = (
  config: PoolConfig,
  defaults: ExecuteOptions,
  readConfigs: readonly PoolConfig[] = [],
): ConnectionManager => {
  const pool = new Pool({ ...config, types: typeParsers });
  pool.on('error', () => {});
  const readers = readConfigs.map((readConfig) => {
    const reader = new Pool({ ...readConfig, types: typeParsers });
    reader.on('error', () => {});
    return reader;
  });
  const cursor = { next: 0 };
  const poolFor = (options: ExecuteOptions): Pool => {
    if (options.route !== 'read' || readers.length === 0) {
      return pool;
    }
    const reader = readers[cursor.next % readers.length] ?? pool;
    cursor.next += 1;
    return reader;
  };

  // Hot path: one tryPromise per statement (Effect overhead is per node, see bench/).
  const runOn = (
    client: Client,
    query: CompiledQuery,
    options: ExecuteOptions,
  ): Effect.Effect<QueryResult, BaseError> =>
    Effect.tryPromise({
      try: async (): Promise<QueryResult> => {
        const started = performance.now();
        const result = await client.query({ text: query.text, values: [...query.values] });
        log(query, options, defaults, performance.now() - started);
        return { rows: result.rows, rowCount: result.rowCount ?? 0, command: result.command };
      },
      catch: (error) => mapQueryError(error, { sql: query.text, parameters: query.values }),
    });

  const execute = (
    query: CompiledQuery,
    options: ExecuteOptions = {},
  ): Effect.Effect<QueryResult, BaseError> =>
    options.client === undefined
      ? Effect.acquireUseRelease(
          connect(poolFor(options)),
          (client) => runOn(client, query, options),
          release,
        )
      : runOn(options.client, query, options);

  const copyFrom = (
    text: string,
    lines: AsyncIterable<string>,
    options: ExecuteOptions = {},
  ): Effect.Effect<number, BaseError> =>
    Effect.scoped(
      clientFor(options, pool).pipe(
        Effect.flatMap((client) =>
          Effect.acquireUseRelease(
            Effect.sync(() => ({
              copy: new CopyFromStdin(text, lines),
              started: performance.now(),
            })),
            ({ copy, started }) => {
              const done = copy.done();
              void (client as unknown as Submittable).query(copy);
              return Effect.tryPromise({
                try: () => done,
                catch: (error) => mapQueryError(error, { sql: text, parameters: [] }),
              }).pipe(
                Effect.tap(() =>
                  Effect.sync(() =>
                    log({ text, values: [] }, options, defaults, performance.now() - started),
                  ),
                ),
              );
            },
            // pg detaches the query on error: wait until no more data is written before release.
            ({ copy }) => Effect.promise(() => copy.settled()),
          ),
        ),
      ),
    );

  const dedicated: Effect.Effect<PgClient, ConnectionError> = Effect.suspend(() => {
    const client = new PgClient({ ...config, types: typeParsers });
    return Effect.tryPromise({ try: () => client.connect(), catch: mapConnectionError }).pipe(
      Effect.as(client),
    );
  });

  const close: Effect.Effect<void> = Effect.promise(async () => {
    await Promise.all([pool.end(), ...readers.map((reader) => reader.end())]);
  });

  async function* copyTo(
    text: string,
    options: ExecuteOptions = {},
  ): AsyncGenerator<Buffer, void, undefined> {
    const client = options.client ?? (await Effect.runPromise(connect(pool)));
    const started = performance.now();
    const copy = new CopyToStdout(text);
    void (client as unknown as Submittable).query(copy);
    let completed = false;
    try {
      yield* copy.chunks();
      await copy.done();
      completed = true;
      log({ text, values: [] }, options, defaults, performance.now() - started);
    } catch (error) {
      throw mapQueryError(error, { sql: text, parameters: [] });
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

  return {
    effects: { execute, client: scopedClient(pool), copyFrom, dedicated, close },
    execute: (query, options) => Effect.runPromise(execute(query, options)),
    acquire: () => Effect.runPromise(connect(pool)),
    copyFrom: (text, lines, options) => Effect.runPromise(copyFrom(text, lines, options)),
    copyTo,
    dedicated: () => Effect.runPromise(dedicated),
    close: () => Effect.runPromise(close),
  };
};
