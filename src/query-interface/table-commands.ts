import { DdlGenerator } from '../ddl/ddl-generator.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import { ModelDefinition, type ModelAttributes } from '../model/model-definition.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { SqlCompiler } from '../sql/compile.ts';
import type { CreateTableOptions, DropTableOptions } from './query-interface-types.ts';
import type { StatementRunner } from './statement-runner.ts';

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/**
 * Schema and table DDL of `QueryInterface`. Names are quoted identifiers.
 *
 * @internal
 */
export class TableCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * `CREATE SCHEMA IF NOT EXISTS`.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#runner.run(
      `CREATE SCHEMA IF NOT EXISTS ${SqlCompiler.quoteIdent(schema)}`,
      options,
    );
  }

  /**
   * `DROP SCHEMA IF EXISTS ... CASCADE`.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#runner.run(
      `DROP SCHEMA IF EXISTS ${SqlCompiler.quoteIdent(schema)} CASCADE`,
      options,
    );
  }

  /**
   * Creates a table and its enum types.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param attributes - Column definitions keyed by column name.
   * @param options - Comment and query options.
   */
  async createTable(
    table: TableName,
    attributes: ModelAttributes,
    options: CreateTableOptions,
  ): Promise<void> {
    const columns = Object.entries(attributes).map(([name, attribute]) =>
      ddl.columnOf(ModelDefinition.attribute(name, attribute, false)),
    );
    const { comment, unlogged, temporary } = options;
    const persistence = {
      ...(comment === undefined ? {} : { comment }),
      ...(unlogged === undefined ? {} : { unlogged }),
      ...(temporary === undefined ? {} : { temporary }),
    };
    await this.#runner.runAll(ddl.createTableSql(table, columns, persistence), options);
  }

  /**
   * `DROP TABLE IF EXISTS`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `cascade` and query options.
   */
  async dropTable(table: TableName, options: DropTableOptions): Promise<void> {
    await this.#runner.run(
      `DROP TABLE IF EXISTS ${sqlLiteral.quoteTable(table)}${options.cascade === true ? ' CASCADE' : ''}`,
      options,
    );
  }

  /**
   * Drops tables of the current schema with `CASCADE`, except the skipped ones.
   *
   * @param tables - Table names.
   * @param options - `skip`: table names to keep.
   */
  async dropTables(
    tables: readonly string[],
    options: QueryOptionsBase & Readonly<{ skip?: readonly string[] }>,
  ): Promise<void> {
    await this.#runner.runAll(
      tables
        .filter((name) => !(options.skip ?? []).includes(name))
        .map((name) => `DROP TABLE IF EXISTS ${SqlCompiler.quoteIdent(name)} CASCADE`),
      options,
    );
  }

  /**
   * Renames a table.
   *
   * @param before - Current table.
   * @param after - New table name.
   * @param options - Query options.
   */
  async renameTable(
    before: TableName,
    after: TableName,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(
      `ALTER TABLE ${sqlLiteral.quoteTable(before)} RENAME TO ${SqlCompiler.quoteIdent(sqlLiteral.tableParts(after).name)}`,
      options,
    );
  }
}
