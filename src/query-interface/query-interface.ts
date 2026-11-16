import type { DataTypeInput } from '../data-types/data-types.ts';
import type { ConstraintOptions, IndexField, IndexOptions } from '../ddl/ddl-generator.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { AttributeOptions } from '../model/model-definition.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { BulkData } from './bulk-data.ts';
import { ColumnCommands } from './column-commands.ts';
import { EnumCommands } from './enum-commands.ts';
import { IndexCommands } from './index-commands.ts';
import { QueryInterfacePolicies } from './query-interface-policies.ts';
import { StatementRunner } from './statement-runner.ts';

export type {
  ColumnDescription,
  CreateTableOptions,
  DropTableOptions,
  ForeignKeyReference,
} from './query-interface-types.ts';

/**
 * Schema manipulation API (Sequelize v6 `QueryInterface`) for PostgreSQL. Used by `sync()` and by
 * migrations (`sequelize-cli`, umzug). Obtain the instance with {@link Sequelize.getQueryInterface}.
 * Table names are `string` or `{ tableName, schema }`; identifiers are always quoted and values bound or
 * escaped, never concatenated raw.
 *
 * @example
 * ```ts
 * const queryInterface = sequelize.getQueryInterface();
 * await queryInterface.createTable('users', {
 *   id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
 *   name: { type: DataTypes.STRING, allowNull: false },
 * });
 * await queryInterface.addIndex('users', ['name'], { unique: true });
 * ```
 * @see [Schema guide](/guide/schema)
 */
export class QueryInterface extends QueryInterfacePolicies {
  readonly #columns: ColumnCommands;
  readonly #indexes: IndexCommands;
  readonly #enums: EnumCommands;
  readonly #bulk: BulkData;

  /**
   * Creates the schema API bound to a `Sequelize` instance; prefer {@link Sequelize.getQueryInterface}.
   *
   * @param sequelize - Owning `Sequelize` instance.
   * @example
   * ```ts
   * const api = new QueryInterface(sequelize);
   * await api.showAllTables();
   * ```
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    const runner = new StatementRunner(sequelize);
    this.#columns = new ColumnCommands(runner);
    this.#indexes = new IndexCommands(runner);
    this.#enums = new EnumCommands(runner);
    this.#bulk = new BulkData(runner);
  }

  /**
   * Adds a column with `ALTER TABLE ... ADD COLUMN`; a plain data type or a full attribute definition (nullability, default, references, ...) is accepted.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param attribute - Column definition.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.addColumn('users', 'nickname', { type: DataTypes.STRING, allowNull: true });
   * ```
   */
  async addColumn(
    table: TableName,
    column: string,
    attribute: DataTypeInput | AttributeOptions,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#columns.addColumn(table, column, attribute, options);
  }

  /**
   * Drops a column with `ALTER TABLE ... DROP COLUMN`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.removeColumn('users', 'nickname');
   * ```
   */
  async removeColumn(table: TableName, column: string, options?: QueryOptionsBase): Promise<void> {
    await this.#columns.removeColumn(table, column, options);
  }

  /**
   * Alters the type, nullability, default and comment of an existing column in one go.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param attribute - New column definition.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.changeColumn('users', 'name', { type: DataTypes.STRING(100), allowNull: false });
   * ```
   */
  async changeColumn(
    table: TableName,
    column: string,
    attribute: DataTypeInput | AttributeOptions,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#columns.changeColumn(table, column, attribute, options);
  }

  /**
   * Renames a column with `ALTER TABLE ... RENAME COLUMN`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param before - Current column name.
   * @param after - New column name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.renameColumn('users', 'name', 'full_name');
   * ```
   */
  async renameColumn(
    table: TableName,
    before: string,
    after: string,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#columns.renameColumn(table, before, after, options);
  }

  /**
   * Creates an index on a table, optionally unique, partial, covering or `CONCURRENTLY`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param fieldsOrOptions - Indexed fields or index options.
   * @param options - Index options when fields are given separately.
   *
   * @example
   * ```ts
   * await queryInterface.addIndex('users', ['email'], { unique: true, name: 'users_email_unique' });
   * await queryInterface.addIndex('users', {
   *   name: 'users_lower_email',
   *   fields: [{ expression: 'lower(email)', nulls: 'LAST' }],
   * });
   * ```
   */
  async addIndex(
    table: TableName,
    fieldsOrOptions: readonly IndexField[] | IndexOptions,
    options: IndexOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#indexes.addIndex(table, fieldsOrOptions, options);
  }

  /**
   * Drops an index identified by name, or by the fields it was created on (the default generated name is derived from them).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param nameOrFields - Index name or indexed fields.
   * @param options - `concurrently` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.removeIndex('users', 'users_email_unique');
   * ```
   */
  async removeIndex(
    table: TableName,
    nameOrFields: string | readonly IndexField[],
    options: QueryOptionsBase & Readonly<{ concurrently?: boolean }> = {},
  ): Promise<void> {
    await this.#indexes.removeIndex(table, nameOrFields, options);
  }

  /**
   * Adds a `CHECK`, `UNIQUE`, `PRIMARY KEY` or `FOREIGN KEY` constraint to a table.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Constraint definition.
   *
   * @example
   * ```ts
   * await queryInterface.addConstraint('products', {
   *   type: 'check',
   *   fields: ['price'],
   *   name: 'products_price_positive',
   *   where: { price: { [Op.gt]: 0 } },
   * });
   * ```
   */
  async addConstraint(
    table: TableName,
    options: ConstraintOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#indexes.addConstraint(table, options);
  }

  /**
   * Drops a named constraint from a table.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Constraint name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.removeConstraint('products', 'products_price_positive');
   * ```
   */
  async removeConstraint(
    table: TableName,
    name: string,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#indexes.removeConstraint(table, name, options);
  }

  /**
   * Runs `DROP TYPE IF EXISTS` for an enum type.
   *
   * @param name - Enum type name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropEnum('enum_users_role');
   * ```
   */
  async dropEnum(name: string, options?: QueryOptionsBase): Promise<void> {
    await this.#enums.dropEnum(name, options);
  }

  /**
   * Drops every enum type of the current schema with `CASCADE`, which also drops dependent columns' defaults. Destructive.
   *
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropAllEnums();
   * ```
   */
  async dropAllEnums(options?: QueryOptionsBase): Promise<void> {
    await this.#enums.dropAllEnums(options);
  }

  /** @internal */
  async dropEnumsOf(
    table: TableName,
    fields: readonly string[],
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#enums.dropEnumsOf(table, fields, options);
  }

  /**
   * Inserts several rows with one `INSERT` (used by seeders). Values are bound as parameters.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param records - Rows keyed by column name.
   * @param options - Query options.
   * @returns Number of inserted rows.
   *
   * @example
   * ```ts
   * const inserted = await queryInterface.bulkInsert('users', [
   *   { name: 'Ada', email: 'ada@example.com' },
   *   { name: 'Alan', email: 'alan@example.com' },
   * ]);
   * ```
   */
  async bulkInsert(
    table: TableName,
    records: readonly Readonly<Record<string, unknown>>[],
    options: QueryOptionsBase = {},
  ): Promise<number> {
    return await this.#bulk.bulkInsert(table, records, options);
  }

  /**
   * Updates every row matching a where object with one `UPDATE`, without model hooks or validation.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param values - New column values.
   * @param where - Filter (where object keyed by column).
   * @param options - Query options.
   * @returns Number of updated rows.
   *
   * @example
   * ```ts
   * const updated = await queryInterface.bulkUpdate('users', { active: false }, { name: 'Ada' });
   * ```
   */
  async bulkUpdate(
    table: TableName,
    values: Readonly<Record<string, unknown>>,
    where: unknown,
    options: QueryOptionsBase = {},
  ): Promise<number> {
    return await this.#bulk.bulkUpdate(table, values, where, options);
  }

  /**
   * Deletes every row matching a where object with one `DELETE`, without model hooks.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param where - Filter (where object keyed by column); empty deletes all rows.
   * @param options - Query options.
   * @returns Number of deleted rows.
   *
   * @example
   * ```ts
   * const removed = await queryInterface.bulkDelete('users', { active: false });
   * ```
   */
  async bulkDelete(
    table: TableName,
    where: unknown = {},
    options: QueryOptionsBase = {},
  ): Promise<number> {
    return await this.#bulk.bulkDelete(table, where, options);
  }
}
