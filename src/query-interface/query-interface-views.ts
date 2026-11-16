import type {
  CreateMaterializedViewOptions,
  CreateViewOptions,
  DropViewOptions,
  RefreshMaterializedViewOptions,
} from '../ddl/view-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { QueryInterfaceRoutines } from './query-interface-routines.ts';
import { StatementRunner } from './statement-runner.ts';
import { ViewCommands } from './view-commands.ts';

/**
 * View part of {@link QueryInterface}: views and materialized views.
 */
export class QueryInterfaceViews extends QueryInterfaceRoutines {
  readonly #views: ViewCommands;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    this.#views = new ViewCommands(new StatementRunner(sequelize));
  }

  /**
   * Creates a view with `CREATE VIEW`; `replace` renders `CREATE OR REPLACE VIEW`.
   *
   * The `query` is SQL text you provide: it is not escaped, so never build it from user input. Names and column lists are quoted identifiers. A trailing `;` is removed.
   *
   * @param name - View name or `{ tableName, schema }`.
   * @param query - Trusted `SELECT` text.
   * @param options - `replace`, `temporary`, `recursive`, `columns`, `checkOption`, `securityBarrier`, `securityInvoker` and query options.
   * @throws Error for an empty query, a recursive view without `columns` or an unknown `checkOption`.
   *
   * @example
   * ```ts
   * await queryInterface.createView('published_posts', 'SELECT id, title FROM "Posts" WHERE published', { replace: true });
   * ```
   * @see [Schema objects guide](/guide/schema-objects)
   */
  async createView(
    name: TableName,
    query: string,
    options: CreateViewOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#views.createView(name, query, options);
  }

  /**
   * Drops a view with `DROP VIEW`.
   *
   * @param name - View name or `{ tableName, schema }`.
   * @param options - `ifExists`, `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropView('published_posts', { ifExists: true });
   * ```
   */
  async dropView(name: TableName, options: DropViewOptions & QueryOptionsBase = {}): Promise<void> {
    await this.#views.dropView(name, false, options);
  }

  /**
   * Creates a materialized view with `CREATE MATERIALIZED VIEW`.
   *
   * The `query` is trusted SQL text, as in {@link QueryInterface.createView}. PostgreSQL has no `OR REPLACE` for materialized views: drop and create, or use `ifNotExists`.
   *
   * @param name - View name or `{ tableName, schema }`.
   * @param query - Trusted `SELECT` text.
   * @param options - `ifNotExists`, `columns`, `using`, `withData` and query options.
   * @throws Error for an empty query or an invalid access method.
   *
   * @example
   * ```ts
   * await queryInterface.createMaterializedView('post_stats', 'SELECT author_id, count(*) AS n FROM "Posts" GROUP BY author_id');
   * ```
   */
  async createMaterializedView(
    name: TableName,
    query: string,
    options: CreateMaterializedViewOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#views.createMaterializedView(name, query, options);
  }

  /**
   * Recomputes a materialized view with `REFRESH MATERIALIZED VIEW`.
   *
   * @param name - View name or `{ tableName, schema }`.
   * @param options - `concurrently` (needs a unique index), `withData` and query options.
   * @throws Error when `concurrently` is combined with `withData: false`.
   *
   * @example
   * ```ts
   * await queryInterface.refreshMaterializedView('post_stats', { concurrently: true });
   * ```
   */
  async refreshMaterializedView(
    name: TableName,
    options: RefreshMaterializedViewOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#views.refreshMaterializedView(name, options);
  }

  /**
   * Drops a materialized view with `DROP MATERIALIZED VIEW`.
   *
   * @param name - View name or `{ tableName, schema }`.
   * @param options - `ifExists`, `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropMaterializedView('post_stats', { ifExists: true });
   * ```
   */
  async dropMaterializedView(
    name: TableName,
    options: DropViewOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#views.dropView(name, true, options);
  }
}
