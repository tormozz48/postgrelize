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

/** Connection settings of one replication member. */
export type ReplicationMember = Readonly<{
  /** Host. */
  host?: string;
  /** Port. */
  port?: number;
  /** User name. */
  username?: string;
  /** Password. */
  password?: string;
  /** Database name. */
  database?: string;
}>;

/** `replication` option: readers receive SELECTs outside transactions, the writer everything else. */
export type ReplicationOptions = Readonly<{
  /** Reader(s). */
  read: ReplicationMember | readonly ReplicationMember[];
  /** Writer; defaults to the top-level connection settings. */
  write?: ReplicationMember;
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
  /** Read replicas and writer (Sequelize v6 `replication`); entries inherit missing connection settings. */
  replication?: ReplicationOptions;
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
