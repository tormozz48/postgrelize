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
   * Runs `CREATE SCHEMA IF NOT EXISTS` for a schema.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.createSchema('tenant_1');
   * ```
   */
  async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#tables.createSchema(schema, options);
  }

  /**
   * Runs `DROP SCHEMA IF EXISTS ... CASCADE`, removing the schema and everything in it.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropSchema('tenant_1');
   * ```
   */
  async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#tables.dropSchema(schema, options);
  }

  /**
   * Lists application schemas, leaving out `public`, `information_schema` and `pg_*` schemas.
   *
   * @param options - Query options.
   * @returns Schema names.
   *
   * @example
   * ```ts
   * const schemas = await queryInterface.showAllSchemas();
   * ```
   */
  async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
    return await this.#introspector.showAllSchemas(options);
  }

  /**
   * Drops, with `CASCADE`, every schema listed by {@link QueryInterface.showAllSchemas} Destructive.
   *
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropAllSchemas();
   * ```
   */
  async dropAllSchemas(options?: QueryOptionsBase): Promise<void> {
    const schemas = await this.showAllSchemas(options);
    await Promise.all(schemas.map((schema) => this.dropSchema(schema, options)));
  }

  /**
   * Creates a table together with the enum types its columns need, if the table does not exist yet. Foreign keys, defaults and comments come from the attribute definitions.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param attributes - Column definitions keyed by column name.
   * @param options - Comment and query options.
   *
   * @example
   * ```ts
   * await queryInterface.createTable(
   *   { tableName: 'posts', schema: 'tenant_1' },
   *   {
   *     id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
   *     title: { type: DataTypes.STRING, allowNull: false },
   *   },
   *   { comment: 'Blog posts' },
   * );
   * ```
   */
  async createTable(
    table: TableName,
    attributes: ModelAttributes,
    options: CreateTableOptions = {},
  ): Promise<void> {
    await this.#tables.createTable(table, attributes, options);
  }

  /**
   * Runs `DROP TABLE IF EXISTS` for a table; it does not drop the table's enum types.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropTable('posts', { cascade: true });
   * ```
   */
  async dropTable(table: TableName, options: DropTableOptions = {}): Promise<void> {
    await this.#tables.dropTable(table, options);
  }

  /**
   * Drops every table of the current schema with `CASCADE`, except the skipped ones. Destructive.
   *
   * @param options - `skip`: table names to keep, plus query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropAllTables({ skip: ['SequelizeMeta'] });
   * ```
   */
  async dropAllTables(
    options: QueryOptionsBase & Readonly<{ skip?: readonly string[] }> = {},
  ): Promise<void> {
    await this.#tables.dropTables(await this.showAllTables(options), options);
  }

  /**
   * Renames a table with `ALTER TABLE ... RENAME TO`; the schema of `after` is ignored.
   *
   * @param before - Current table.
   * @param after - New table name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.renameTable('posts', 'articles');
   * ```
   */
  async renameTable(
    before: TableName,
    after: TableName,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#tables.renameTable(before, after, options);
  }

  /**
   * Tells whether a table exists in its schema (the current schema when none is given).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns True when the table exists.
   *
   * @example
   * ```ts
   * if (!(await queryInterface.tableExists('posts'))) {
   *   await queryInterface.createTable('posts', { title: DataTypes.STRING });
   * }
   * ```
   */
  async tableExists(table: TableName, options?: QueryOptionsBase): Promise<boolean> {
    return await this.#introspector.tableExists(table, options);
  }

  /**
   * Lists the table names of the current schema in alphabetical order.
   *
   * @param options - Query options.
   * @returns Table names.
   *
   * @example
   * ```ts
   * const tables = await queryInterface.showAllTables(); // e.g. ['posts', 'users']
   * ```
   */
  async showAllTables(options?: QueryOptionsBase): Promise<string[]> {
    return await this.#introspector.showAllTables(options);
  }

  /**
   * Reads the column metadata of a table from the catalog.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `schema` and query options.
   * @returns Column descriptions keyed by column name.
   * @throws Error when the table does not exist.
   *
   * @example
   * ```ts
   * const columns = await queryInterface.describeTable('users');
   * const emailNullable = columns['email']?.allowNull;
   * ```
   */
  async describeTable(
    table: TableName,
    options: QueryOptionsBase & Readonly<{ schema?: string }> = {},
  ): Promise<Record<string, ColumnDescription>> {
    return await this.#introspector.describeTable(table, options);
  }

  /**
   * Lists the foreign key columns of a table with the table and column each one references.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns Constraint name, column and referenced table/column per foreign key column.
   *
   * @example
   * ```ts
   * const references = await queryInterface.getForeignKeyReferencesForTable('posts');
   * const targets = references.map((reference) => reference.referencedTableName);
   * ```
   */
  async getForeignKeyReferencesForTable(
    table: TableName,
    options?: QueryOptionsBase,
  ): Promise<ForeignKeyReference[]> {
    return await this.#introspector.getForeignKeyReferencesForTable(table, options);
  }
}
