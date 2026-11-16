import {
  ViewDdl,
  type CreateMaterializedViewOptions,
  type CreateViewOptions,
  type DropViewOptions,
  type RefreshMaterializedViewOptions,
} from '../ddl/view-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { StatementRunner } from './statement-runner.ts';

const views = new ViewDdl();

/**
 * View and materialized view DDL of `QueryInterface`. Names are quoted; the query is trusted SQL.
 *
 * @internal
 */
export class ViewCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Runs `CREATE VIEW`.
   *
   * @param name - View name.
   * @param query - Trusted `SELECT` text.
   * @param options - View and query options.
   */
  async createView(
    name: TableName,
    query: string,
    options: CreateViewOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(views.createSql(name, query, options), options);
  }

  /**
   * Runs `CREATE MATERIALIZED VIEW`.
   *
   * @param name - View name.
   * @param query - Trusted `SELECT` text.
   * @param options - View and query options.
   */
  async createMaterializedView(
    name: TableName,
    query: string,
    options: CreateMaterializedViewOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(views.createMaterializedSql(name, query, options), options);
  }

  /**
   * Runs `REFRESH MATERIALIZED VIEW`.
   *
   * @param name - View name.
   * @param options - Refresh and query options.
   */
  async refreshMaterializedView(
    name: TableName,
    options: RefreshMaterializedViewOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(views.refreshSql(name, options), options);
  }

  /**
   * Runs `DROP VIEW` or `DROP MATERIALIZED VIEW`.
   *
   * @param name - View name.
   * @param materialized - Drops a materialized view.
   * @param options - Drop and query options.
   */
  async dropView(
    name: TableName,
    materialized: boolean,
    options: DropViewOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(views.dropSql(name, materialized, options), options);
  }
}
