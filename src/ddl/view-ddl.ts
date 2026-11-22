import { SqlCompiler } from '../sql/compile.ts';
import { RoutineGuards } from './routine-guards.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new RoutineGuards();

const sqlLiteral = new SqlLiteral();

const CHECK_OPTIONS: Readonly<Record<string, string>> = { local: 'LOCAL', cascaded: 'CASCADED' };

/**
 * Options of `createView`. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: CreateViewOptions = { replace: true, columns: ['id', 'title'], checkOption: 'local' };
 * await queryInterface.createView('published_posts', 'SELECT id, title FROM "Posts" WHERE published', options);
 * ```
 */
export type CreateViewOptions = Readonly<{
  /** `CREATE OR REPLACE VIEW`. */
  replace?: boolean;
  /** `CREATE TEMPORARY VIEW`: lives as long as the database session (pooled connection). */
  temporary?: boolean;
  /** `CREATE RECURSIVE VIEW`; needs `columns`. */
  recursive?: boolean;
  /** Output column names. */
  columns?: readonly string[];
  /** `WITH LOCAL | CASCADED CHECK OPTION` for updatable views. */
  checkOption?: 'local' | 'cascaded';
  /** `security_barrier` view option. */
  securityBarrier?: boolean;
  /** `security_invoker` view option (queries run with the privileges of the caller). */
  securityInvoker?: boolean;
}>;

/**
 * Options of `createMaterializedView`. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: CreateMaterializedViewOptions = { ifNotExists: true, withData: false };
 * await queryInterface.createMaterializedView('post_stats', 'SELECT count(*) AS n FROM "Posts"', options);
 * ```
 */
export type CreateMaterializedViewOptions = Readonly<{
  /** Adds `IF NOT EXISTS`. */
  ifNotExists?: boolean;
  /** Output column names. */
  columns?: readonly string[];
  /** Table access method (`USING heap`). */
  using?: string;
  /** `false` renders `WITH NO DATA`: the view is created empty and unreadable until refreshed. */
  withData?: boolean;
}>;

/**
 * Options of `refreshMaterializedView`. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: RefreshMaterializedViewOptions = { concurrently: true };
 * await queryInterface.refreshMaterializedView('post_stats', options);
 * ```
 */
export type RefreshMaterializedViewOptions = Readonly<{
  /** `REFRESH ... CONCURRENTLY`: readers are not blocked; needs a unique index and cannot be combined with `withData: false`. */
  concurrently?: boolean;
  /** `false` renders `WITH NO DATA` (empties the view). */
  withData?: boolean;
}>;

/**
 * Options of `dropView` and `dropMaterializedView`. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: DropViewOptions = { ifExists: true, cascade: true };
 * await queryInterface.dropView('published_posts', options);
 * ```
 */
export type DropViewOptions = Readonly<{
  /** Adds `IF EXISTS`. */
  ifExists?: boolean;
  /** Also drops objects that depend on the view. */
  cascade?: boolean;
}>;

/**
 * `CREATE`, `REFRESH` and `DROP` statements for views and materialized views. The query text is
 * trusted SQL (ADR-025); names and column lists are quoted.
 *
 * @internal
 */
export class ViewDdl {
  /**
   * `CREATE [OR REPLACE] [TEMPORARY] [RECURSIVE] VIEW` statement.
   *
   * @param name - View name.
   * @param query - Trusted `SELECT` text.
   * @param options - View options.
   * @returns Statement.
   * @throws Error for an empty query, a recursive view without columns or an unknown check option.
   */
  createSql(name: TableName, query: string, options: CreateViewOptions): string {
    if (options.recursive === true && (options.columns ?? []).length === 0) {
      throw new Error('A recursive view requires columns');
    }
    const head = `CREATE ${options.replace === true ? 'OR REPLACE ' : ''}${options.temporary === true ? 'TEMPORARY ' : ''}${options.recursive === true ? 'RECURSIVE ' : ''}VIEW ${sqlLiteral.quoteTable(name)}`;
    return [
      head,
      this.#columns(options.columns),
      this.#withOptions(options),
      ` AS ${this.#query(query)}`,
      this.#checkOption(options.checkOption),
    ].join('');
  }

  /**
   * `CREATE MATERIALIZED VIEW` statement.
   *
   * @param name - View name.
   * @param query - Trusted `SELECT` text.
   * @param options - View options.
   * @returns Statement.
   * @throws Error for an empty query or an invalid access method.
   */
  createMaterializedSql(
    name: TableName,
    query: string,
    options: CreateMaterializedViewOptions,
  ): string {
    return [
      `CREATE MATERIALIZED VIEW ${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}${sqlLiteral.quoteTable(name)}`,
      this.#columns(options.columns),
      options.using === undefined ? '' : ` USING ${guards.word(options.using, 'access method')}`,
      ` AS ${this.#query(query)}`,
      options.withData === false ? ' WITH NO DATA' : '',
    ].join('');
  }

  /**
   * `REFRESH MATERIALIZED VIEW` statement.
   *
   * @param name - View name.
   * @param options - Refresh options.
   * @returns Statement.
   * @throws Error when `concurrently` is combined with `withData: false`.
   */
  refreshSql(name: TableName, options: RefreshMaterializedViewOptions): string {
    if (options.concurrently === true && options.withData === false) {
      throw new Error('CONCURRENTLY cannot be combined with WITH NO DATA');
    }
    return `REFRESH MATERIALIZED VIEW ${options.concurrently === true ? 'CONCURRENTLY ' : ''}${sqlLiteral.quoteTable(name)}${options.withData === false ? ' WITH NO DATA' : ''}`;
  }

  /**
   * `DROP VIEW` or `DROP MATERIALIZED VIEW` statement.
   *
   * @param name - View name.
   * @param materialized - Drops a materialized view.
   * @param options - Drop options.
   * @returns Statement.
   */
  dropSql(name: TableName, materialized: boolean, options: DropViewOptions): string {
    return `DROP ${materialized ? 'MATERIALIZED ' : ''}VIEW ${options.ifExists === true ? 'IF EXISTS ' : ''}${sqlLiteral.quoteTable(name)}${options.cascade === true ? ' CASCADE' : ''}`;
  }

  #query(query: string): string {
    if (typeof query !== 'string' || query.trim() === '') {
      throw new Error('A view requires a query');
    }
    return query.trim().replace(/;+\s*$/, '');
  }

  #columns(columns: readonly string[] | undefined): string {
    return columns === undefined || columns.length === 0
      ? ''
      : ` (${columns.map(SqlCompiler.quoteIdent).join(', ')})`;
  }

  #withOptions(options: CreateViewOptions): string {
    const settings = [
      options.securityBarrier === undefined
        ? ''
        : `security_barrier = ${String(options.securityBarrier === true)}`,
      options.securityInvoker === undefined
        ? ''
        : `security_invoker = ${String(options.securityInvoker === true)}`,
    ].filter((setting) => setting !== '');
    return settings.length === 0 ? '' : ` WITH (${settings.join(', ')})`;
  }

  #checkOption(checkOption: string | undefined): string {
    if (checkOption === undefined) {
      return '';
    }
    const sql = Object.hasOwn(CHECK_OPTIONS, checkOption) ? CHECK_OPTIONS[checkOption] : undefined;
    if (sql === undefined) {
      throw new Error(`Invalid check option: ${checkOption}`);
    }
    return ` WITH ${sql} CHECK OPTION`;
  }
}
