import type { PoolConfig } from 'pg';
import type { HooksOption } from '../hooks/hooks.ts';

/** Function receiving executed SQL. With `benchmark: true` the second argument is the duration in ms. */
export type LoggingFunction = (sql: string, timingOrOptions?: unknown) => void;

/** Connection pool settings (Sequelize v6 `PoolOptions`). */
export type PoolOptions = Readonly<{
  /** Maximum number of connections. Default 5. */
  max?: number;
  /** Minimum number of connections. Accepted for compatibility; `pg` does not keep idle minimums. */
  min?: number;
  /** Milliseconds a connection may be idle before release. Default 10000. */
  idle?: number;
  /** Milliseconds to wait for a connection before throwing `ConnectionAcquireTimeoutError`. Default 60000. */
  acquire?: number;
  /** Accepted for compatibility; eviction is handled by `idle`. */
  evict?: number;
  /** Maximum times a connection may be used before it is replaced (`pg` `maxUses`). */
  maxUses?: number;
}>;

/** Defaults applied to every model defined through this instance (Sequelize v6 `define` option). */
export type ModelDefaults = Readonly<{
  /** Add `createdAt` / `updatedAt`. Default true. */
  timestamps?: boolean;
  /** Use snake_case column names for attributes and the table name. */
  underscored?: boolean;
  /** Use the model name as table name without pluralization. */
  freezeTableName?: boolean;
  /** PostgreSQL schema of the tables. */
  schema?: string;
  /** Soft-delete rows (`deletedAt`) instead of deleting them. */
  paranoid?: boolean;
  /** Hooks added to every model. */
  hooks?: HooksOption;
}>;

/** Options of the {@link Sequelize} constructor (PostgreSQL subset of Sequelize v6 `Options`). */
export type SequelizeOptions = Readonly<{
  /** Must be `'postgres'` when given. */
  dialect?: 'postgres';
  /** Database name. */
  database?: string;
  /** User name. */
  username?: string;
  /** Password. */
  password?: string;
  /** Host. Default `'localhost'`. */
  host?: string;
  /** Port. Default 5432. */
  port?: number;
  /** SSL settings passed to `pg`. */
  ssl?: PoolConfig['ssl'];
  /** Extra options passed to the `pg` pool/client as is. */
  dialectOptions?: Readonly<Omit<PoolConfig, 'types'>>;
  /** Pool settings. */
  pool?: PoolOptions;
  /** SQL logger, or `false` to disable. Default `console.log`. */
  logging?: LoggingFunction | false;
  /** Pass query duration to the logger. */
  benchmark?: boolean;
  /** Session time zone. Default `'+00:00'`. */
  timezone?: string;
  /** Defaults for all models. */
  define?: ModelDefaults;
  /** Sequelize-level hooks run for every model (and `beforeConnect`). */
  hooks?: HooksOption;
  /** Minimum IN-list length compiled to `= ANY($n)`. Default 100. PostgreSQL extension. */
  inAsAnyThreshold?: number;
}>;

/** Connection settings exposed as `sequelize.config` (Sequelize v6 shape). */
export type ConnectionConfig = Readonly<{
  /** Database name. */
  database: string | undefined;
  /** User name. */
  username: string | undefined;
  /** Password. */
  password: string | undefined;
  /** Host. */
  host: string;
  /** Port. */
  port: number;
}>;

type ConstructorArgs =
  | readonly [SequelizeOptions?]
  | readonly [string, SequelizeOptions?]
  | readonly [string, string | null | undefined, (string | null | undefined)?, SequelizeOptions?];

const fromUri = (uri: string): SequelizeOptions => {
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
};

const isUri = (value: string): boolean => /^[a-z]+:\/\//i.test(value);

const definedOnly = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  ) as T;

/** Normalizes the overloaded Sequelize v6 constructor arguments into one options object. */
export const parseConstructorArgs = (args: ConstructorArgs): SequelizeOptions => {
  const [first, second, third, fourth] = args;
  const options: SequelizeOptions =
    first === undefined || typeof first === 'object'
      ? (first ?? {})
      : isUri(first)
        ? { ...(typeof second === 'object' && second !== null ? second : {}), ...fromUri(first) }
        : {
            ...(fourth ?? (typeof second === 'object' && second !== null ? second : {})),
            ...definedOnly({
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
};

/** Builds `sequelize.config` from normalized options. */
export const connectionConfig = (options: SequelizeOptions): ConnectionConfig => ({
  database: options.database,
  username: options.username,
  password: options.password,
  host: options.host ?? 'localhost',
  port: options.port ?? 5432,
});

/** Builds the `pg` pool configuration from normalized options. */
export const poolConfig = (options: SequelizeOptions): PoolConfig => {
  const config = connectionConfig(options);
  const pool = options.pool ?? {};
  const timezone = options.timezone ?? '+00:00';
  return definedOnly({
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
    options: [`-c TimeZone=${timezone}`, options.dialectOptions?.options].filter(Boolean).join(' '),
  });
};
