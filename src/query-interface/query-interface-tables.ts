import type { TableName } from '../ddl/sql-literal.ts';
import type { ModelAttributes } from '../model/model-definition.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import type {
  ColumnDescription,
  CreateTableOptions,
  DropTableOptions,
  ForeignKeyReference,
} from './query-interface-types.ts';
import { StatementRunner } from './statement-runner.ts';
import { TableCommands } from './table-commands.ts';
import { TableIntrospector } from './table-introspector.ts';

/**
 * Schema and table part of {@link QueryInterface}: schemas, tables and catalog lookups.
 */
export class QueryInterfaceTables {
  /** Owning `Sequelize` instance. */
  readonly sequelize: RuntimeOwner;
  readonly #introspector: TableIntrospector;
  readonly #tables: TableCommands;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    this.sequelize = sequelize;
    const runner = new StatementRunner(sequelize);
    this.#introspector = new TableIntrospector(runner);
    this.#tables = new TableCommands(runner);
  }

  /**
   * Creates a schema if it does not exist.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#tables.createSchema(schema, options);
  }

  /**
   * Drops a schema with everything in it.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#tables.dropSchema(schema, options);
  }

  /**
   * Lists user schemas.
   *
   * @param options - Query options.
   * @returns Schema names.
   */
  async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
    return await this.#introspector.showAllSchemas(options);
  }

  /**
   * Drops every user schema listed by {@link QueryInterface.showAllSchemas} with everything in it.
   *
   * @param options - Query options.
   */
  async dropAllSchemas(options?: QueryOptionsBase): Promise<void> {
    const schemas = await this.showAllSchemas(options);
    await Promise.all(schemas.map((schema) => this.dropSchema(schema, options)));
  }

  /**
   * Creates a table (and its enum types) if it does not exist.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param attributes - Column definitions keyed by column name.
   * @param options - Comment and query options.
   */
  async createTable(
    table: TableName,
    attributes: ModelAttributes,
    options: CreateTableOptions = {},
  ): Promise<void> {
    await this.#tables.createTable(table, attributes, options);
  }

  /**
   * Drops a table if it exists.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `cascade` and query options.
   */
  async dropTable(table: TableName, options: DropTableOptions = {}): Promise<void> {
    await this.#tables.dropTable(table, options);
  }

  /**
   * Drops all tables of the current schema.
   *
   * @param options - `skip`: table names to keep.
   */
  async dropAllTables(
    options: QueryOptionsBase & Readonly<{ skip?: readonly string[] }> = {},
  ): Promise<void> {
    await this.#tables.dropTables(await this.showAllTables(options), options);
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
    await this.#tables.renameTable(before, after, options);
  }

  /**
   * Checks whether a table exists.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns True when the table exists.
   */
  async tableExists(table: TableName, options?: QueryOptionsBase): Promise<boolean> {
    return await this.#introspector.tableExists(table, options);
  }

  /**
   * Lists tables of the current schema.
   *
   * @param options - Query options.
   * @returns Table names.
   */
  async showAllTables(options?: QueryOptionsBase): Promise<string[]> {
    return await this.#introspector.showAllTables(options);
  }

  /**
   * Describes the columns of a table.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `schema` and query options.
   * @returns Column descriptions keyed by column name.
   * @throws Error when the table does not exist.
   */
  async describeTable(
    table: TableName,
    options: QueryOptionsBase & Readonly<{ schema?: string }> = {},
  ): Promise<Record<string, ColumnDescription>> {
    return await this.#introspector.describeTable(table, options);
  }

  /**
   * Foreign keys of a table.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns Constraint name, column and referenced table/column per foreign key column.
   */
  async getForeignKeyReferencesForTable(
    table: TableName,
    options?: QueryOptionsBase,
  ): Promise<ForeignKeyReference[]> {
    return await this.#introspector.getForeignKeyReferencesForTable(table, options);
  }
}
