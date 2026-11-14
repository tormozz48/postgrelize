import type { QueryResult } from '../connection/executor.ts';
import type { LoggingFunction, ModelDefaults } from '../connection/options.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { HookRegistry } from '../hooks/hooks.ts';
import type { QueryInterface } from '../query-interface/query-interface.ts';
import type { Transaction } from '../transaction/transaction.ts';

/** Options common to every query issued by a model. */
export type QueryOptionsBase = Readonly<{
  /** Transaction to run in; `null` forces running outside the CLS transaction. */
  transaction?: Transaction | null;
  /** SQL logger for this query, or `false`. */
  logging?: LoggingFunction | false;
  /** Pass query duration to the logger. */
  benchmark?: boolean;
}>;

/** Services a `Sequelize` instance provides to its models. */
export type ModelRuntime = Readonly<{
  execute: (query: CompiledQuery, options: QueryOptionsBase) => Promise<QueryResult>;
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
  /** `server_version_num` of the database (cached). */
  serverVersion: () => Promise<number>;
  /** Registered models by name. */
  models: () => Readonly<Record<string, object>>;
  hooks: () => HookRegistry;
  defaults: ModelDefaults;
  inAsAnyThreshold: number | undefined;
}>;

/** @internal */
export const runtimeKey: unique symbol = Symbol('postgrelize.runtime');

/** Owner of the internal model services: the `Sequelize` instance. */
export type RuntimeOwner = Readonly<{
  /** Internal services used by models. */
  [runtimeKey]: ModelRuntime;
}>;
