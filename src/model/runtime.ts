import type { QueryResult } from '../connection/connection-manager.ts';
import type { LoggingFunction, ModelDefaults } from '../connection/options.ts';
import type { RetryOptions } from '../connection/retry.ts';
import type { Replacements } from '../query/raw-query.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { HookRegistry } from '../hooks/hooks.ts';
import type { QueryInterface } from '../query-interface/query-interface.ts';
import type { Transaction, TransactionOptions } from '../transaction/transaction.ts';

/** Options common to every query issued by a model. */
export type QueryOptionsBase = Readonly<{
  /** Transaction to run in; `null` forces running outside the CLS transaction. */
  transaction?: Transaction | null;
  /** SQL logger for this query, or `false`. */
  logging?: LoggingFunction | false;
  /** Pass query duration to the logger. */
  benchmark?: boolean;
  /**
   * `statement_timeout` for this query only, in milliseconds (non-negative integer; `0` disables it).
   * PostgreSQL cancels the statement with a `DatabaseError` (code `57014`) when it runs longer.
   * Outside a transaction the query runs in its own short transaction; inside one the previous
   * timeout is restored afterwards. PostgreSQL extension.
   */
  statementTimeout?: number;
  /**
   * Retries this query when it fails, merged over the instance `retry` option (Sequelize v6). The
   * connection acquisition is part of the retried work; a query that runs in a transaction is never
   * retried.
   */
  retry?: RetryOptions;
  /** Force the writer even for SELECTs when read replicas are configured. */
  useMaster?: boolean;
  /**
   * Values of `?` (array) or `:name` (object) placeholders written in raw SQL inside the options
   * (`where: literal('"a" = :a')`, `attributes: [[literal(...), 'x']]`), as in Sequelize v6. Every
   * value is sent as a bound parameter, never concatenated into the SQL text; arrays expand to a
   * comma separated list of parameters.
   */
  replacements?: Replacements;
}>;

/** Services a `Sequelize` instance provides to its models. */
export type ModelRuntime = Readonly<{
  execute: (
    query: CompiledQuery,
    options: QueryOptionsBase,
    kind?: 'read' | 'write',
  ) => Promise<QueryResult>;
  transaction: <T>(
    run: (transaction: Transaction) => Promise<T>,
    parent?: Transaction | null,
  ) => Promise<T>;
  register: (name: string, model: object) => void;
  /** Defines a model through the owning Sequelize instance (used for implicit through models). */
  defineModel: (
    name: string,
    attributes: Readonly<Record<string, unknown>>,
    options: Readonly<Record<string, unknown>>,
  ) => object;
  /** Schema API of the owning Sequelize instance. */
  queryInterface: () => QueryInterface;
  /** Streams encoded lines into `COPY ... FROM STDIN`. */
  copyFrom: (
    text: string,
    lines: AsyncIterable<string>,
    options: QueryOptionsBase,
  ) => Promise<number>;
  /** Streams `COPY ... TO STDOUT` output. */
  copyTo: (
    text: string,
    options: QueryOptionsBase,
    kind?: 'read' | 'write',
  ) => AsyncGenerator<Buffer, void, undefined>;
  /** Starts an unmanaged transaction. */
  beginTransaction: (options?: TransactionOptions) => Promise<Transaction>;
  /** `server_version_num` of the database (cached). */
  serverVersion: () => Promise<number>;
  /** Registered models by name. */
  models: () => Readonly<Record<string, object>>;
  hooks: () => HookRegistry;
  defaults: ModelDefaults;
  inAsAnyThreshold: number | undefined;
  /** `minifyAliases` option: shorten include aliases. */
  minifyAliases?: boolean | undefined;
}>;

/** @internal */
export const runtimeKey: unique symbol = Symbol('postgrelize.runtime');

/** Owner of the internal model services: the `Sequelize` instance. */
// An interface (not a type alias) so declaration files reference it by name instead of inlining
// the internal symbol key.
export interface RuntimeOwner {
  /** Internal services used by models. */
  readonly [runtimeKey]: ModelRuntime;
}
