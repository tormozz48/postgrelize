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
    const [first, second, third, fourth] = args;
    const options: SequelizeOptions =
      first === undefined || typeof first === 'object'
        ? (first ?? {})
        : ConnectionConfig.#isUri(first)
          ? {
              ...(typeof second === 'object' && second !== null ? second : {}),
              ...ConnectionConfig.#fromUri(first),
            }
          : {
              ...(fourth ?? (typeof second === 'object' && second !== null ? second : {})),
              ...ConnectionConfig.#definedOnly({
                database: first,
                username: typeof second === 'string' ? second : undefined,
                password: typeof third === 'string' ? third : undefined,
              }),
            };
    if (options.dialect !== undefined && options.dialect !== 'postgres') {
      throw new Error(
        `postgrelize supports only the postgres dialect, got ${String(options.dialect)}`,
      );
    }
    return options;
  }

  static #fromUri(uri: string): SequelizeOptions {
    const url = new URL(uri);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error(`postgrelize supports only postgres:// connection URIs, got ${url.protocol}`);
    }
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const sslmode = url.searchParams.get('sslmode');
    return {
      host: url.hostname,
      ...(url.port === '' ? {} : { port: Number(url.port) }),
      ...(database === '' ? {} : { database }),
      ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
      ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
      ...(sslmode === null || sslmode === 'disable' ? {} : { ssl: true }),
    };
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

  static #poolConfig(options: SequelizeOptions): PoolConfig {
    const config = ConnectionConfig.#settings(options);
    const pool = options.pool ?? {};
    const timezone = options.timezone ?? '+00:00';
    return ConnectionConfig.#definedOnly({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: options.ssl,
      max: pool.max ?? 5,
      idleTimeoutMillis: pool.idle ?? 10_000,
      connectionTimeoutMillis: pool.acquire ?? 60_000,
      maxUses: pool.maxUses,
      ...options.dialectOptions,
      options: [`-c TimeZone=${timezone}`, options.dialectOptions?.options]
        .filter(Boolean)
        .join(' '),
    });
  }
}
