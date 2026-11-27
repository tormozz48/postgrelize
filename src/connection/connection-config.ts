import type { PoolConfig } from 'pg';
import type {
  ConnectionConfig as ConnectionSettings,
  ReplicationMember,
  SequelizeOptions,
} from './options.ts';

type ConstructorArgs =
  | readonly [SequelizeOptions?]
  | readonly [string, SequelizeOptions?]
  | readonly [string, string | null | undefined, (string | null | undefined)?, SequelizeOptions?];

// connection string parameters handed to `pg` (the ones v6 forwards from `dialectOptions`)
const URI_PARAMETERS: ReadonlySet<string> = new Set([
  'application_name',
  'client_encoding',
  'connectionTimeoutMillis',
  'idle_in_transaction_session_timeout',
  'lock_timeout',
  'options',
  'query_timeout',
  'statement_timeout',
]);

const MESSAGE_LEVELS: ReadonlySet<string> = new Set([
  'debug5',
  'debug4',
  'debug3',
  'debug2',
  'debug1',
  'log',
  'notice',
  'warning',
  'error',
]);

/**
 * Connection configuration of a `Sequelize` instance: normalizes the overloaded Sequelize v6
 * constructor arguments and derives the `pg` pool configurations (writer and read replicas).
 */
export class ConnectionConfig {
  /** Normalized constructor options. */
  readonly options: SequelizeOptions;

  /**
   * @param args - Arguments of the `Sequelize` constructor (URI, database / username / password, options).
   * @throws Error for a non-postgres URI or dialect.
   */
  constructor(args: ConstructorArgs) {
    this.options = ConnectionConfig.#parse(args);
  }

  /**
   * Connection settings exposed as `sequelize.config`.
   *
   * @returns Database, user name, password, host and port.
   */
  settings(): ConnectionSettings {
    return ConnectionConfig.#settings(this.options);
  }

  /**
   * Pool configurations of the writer and the readers (no readers without `replication`).
   *
   * @returns Writer and reader `pg` pool configurations.
   */
  replicationPoolConfigs(): Readonly<{ write: PoolConfig; read: readonly PoolConfig[] }> {
    const options = this.options;
    const replication = options.replication;
    if (replication === undefined) {
      return { write: ConnectionConfig.#poolConfig(options), read: [] };
    }
    const readers: readonly ReplicationMember[] = Array.isArray(replication.read)
      ? replication.read
      : [replication.read as ReplicationMember];
    return {
      write: ConnectionConfig.#poolConfig(ConnectionConfig.#withMember(options, replication.write)),
      read: readers.map((member) =>
        ConnectionConfig.#poolConfig(ConnectionConfig.#withMember(options, member)),
      ),
    };
  }

  static #parse(args: ConstructorArgs): SequelizeOptions {
    const options = ConnectionConfig.#merge(args);
    if (options.dialect !== undefined && options.dialect !== 'postgres') {
      throw new Error(
        `postgrelize supports only the postgres dialect, got ${String(options.dialect)}`,
      );
    }
    return options;
  }

  static #merge(args: ConstructorArgs): SequelizeOptions {
    const [first, second, third, fourth] = args;
    if (first === undefined || typeof first === 'object') {
      return first ?? {};
    }
    const secondOptions = typeof second === 'object' && second !== null ? second : {};
    return ConnectionConfig.#isUri(first)
      ? ConnectionConfig.#fromUri(first, secondOptions)
      : {
          ...(fourth ?? secondOptions),
          ...ConnectionConfig.#definedOnly({
            database: first,
            username: typeof second === 'string' ? second : undefined,
            password: typeof third === 'string' ? third : undefined,
          }),
        };
  }

  static #fromUri(uri: string, given: SequelizeOptions): SequelizeOptions {
    const url = new URL(uri);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error(`postgrelize supports only postgres:// connection URIs, got ${url.protocol}`);
    }
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const sslmode = url.searchParams.get('sslmode');
    return {
      ...given,
      ...ConnectionConfig.#fromQuery(url.searchParams, given),
      host: url.searchParams.get('host') ?? url.hostname,
      ...(url.port === '' ? {} : { port: Number(url.port) }),
      ...(database === '' ? {} : { database }),
      ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
      ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
      ...(sslmode === null || sslmode === 'disable' ? {} : { ssl: true }),
    };
  }

  // like v6, parameters of the query string that `pg` understands become `dialectOptions`
  static #fromQuery(query: URLSearchParams, given: SequelizeOptions): SequelizeOptions {
    const passed = [...query].filter(([name]) => URI_PARAMETERS.has(name));
    return passed.length === 0
      ? {}
      : { dialectOptions: { ...given.dialectOptions, ...Object.fromEntries(passed) } };
  }

  static #isUri(value: string): boolean {
    return /^[a-z]+:\/\//i.test(value);
  }

  static #definedOnly<T extends object>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
    ) as T;
  }

  static #settings(options: SequelizeOptions): ConnectionSettings {
    return {
      database: options.database,
      username: options.username,
      password: options.password,
      host: options.host ?? 'localhost',
      port: options.port ?? 5432,
      ...(options.dialectOptions === undefined ? {} : { dialectOptions: options.dialectOptions }),
    };
  }

  static #withMember(
    options: SequelizeOptions,
    member: ReplicationMember | undefined,
  ): SequelizeOptions {
    return member === undefined
      ? options
      : {
          ...options,
          ...Object.fromEntries(Object.entries(member).filter(([, value]) => value !== undefined)),
        };
  }

  // A UTC offset or an IANA zone name: it is passed as a libpq startup option, so no spaces.
  static #timezone(timezone: string): string {
    if (!/^(?:[+-]\d{2}:\d{2}|[A-Za-z][\w+\-/]*)$/.test(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    return timezone;
  }

  static #poolConfig(options: SequelizeOptions): PoolConfig {
    const config = ConnectionConfig.#settings(options);
    const timezone = ConnectionConfig.#timezone(options.timezone ?? '+00:00');
    return ConnectionConfig.#definedOnly({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: options.ssl,
      ...ConnectionConfig.#poolLimits(options),
      ...options.dialectOptions,
      options: ConnectionConfig.#startupOptions(options, timezone),
    });
  }

  static #startupOptions(options: SequelizeOptions, timezone: string): string {
    return [
      `-c TimeZone=${timezone}`,
      ConnectionConfig.#clientMinMessages(options),
      options.dialectOptions?.options,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // like v6, `warning` unless set otherwise; `ignore` / `false` keep the server default. It is
  // passed as a libpq startup option, so only the PostgreSQL levels are accepted.
  static #clientMinMessages(options: SequelizeOptions): string | undefined {
    const given = options.dialectOptions?.clientMinMessages ?? options.clientMinMessages;
    if (given === false || String(given).toLowerCase() === 'ignore') {
      return undefined;
    }
    const level = String(given || 'warning').toLowerCase();
    if (!MESSAGE_LEVELS.has(level)) {
      throw new Error(`Invalid clientMinMessages: ${level}`);
    }
    return `-c client_min_messages=${level}`;
  }

  static #poolLimits(options: SequelizeOptions): PoolConfig {
    const pool = options.pool ?? {};
    return {
      max: pool.max ?? 5,
      idleTimeoutMillis: pool.idle ?? 10_000,
      connectionTimeoutMillis: pool.acquire ?? 60_000,
      maxUses: pool.maxUses,
    };
  }
}
