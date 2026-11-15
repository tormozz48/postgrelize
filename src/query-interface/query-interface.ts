import type { DataTypeInput } from '../data-types/data-types.ts';
import type { ConstraintOptions, IndexField, IndexOptions } from '../ddl/ddl-generator.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { AttributeOptions } from '../model/model-definition.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { BulkData } from './bulk-data.ts';
import { ColumnCommands } from './column-commands.ts';
import { EnumCommands } from './enum-commands.ts';
import { IndexCommands } from './index-commands.ts';
import { QueryInterfaceTables } from './query-interface-tables.ts';
import { StatementRunner } from './statement-runner.ts';

export type {
  ColumnDescription,
  CreateTableOptions,
  DropTableOptions,
  ForeignKeyReference,
} from './query-interface-types.ts';

/**
 * Schema manipulation API (Sequelize v6 `QueryInterface`) for PostgreSQL. Used by `sync()` and by
 * migrations (`sequelize-cli`, umzug).
 */
export class QueryInterface extends QueryInterfaceTables {
  readonly #columns: ColumnCommands;
  readonly #indexes: IndexCommands;
  readonly #enums: EnumCommands;
  readonly #bulk: BulkData;

  /**
   * @param sequelize - Owning `Sequelize` instance.
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
   * Adds a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param attribute - Column definition.
   * @param options - Query options.
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
   * Removes a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param options - Query options.
   */
  async removeColumn(table: TableName, column: string, options?: QueryOptionsBase): Promise<void> {
    await this.#columns.removeColumn(table, column, options);
  }

  /**
   * Changes type, nullability, default and comment of a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param attribute - New column definition.
   * @param options - Query options.
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
   * Renames a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param before - Current column name.
   * @param after - New column name.
   * @param options - Query options.
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
   * Creates an index.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param fieldsOrOptions - Indexed fields or index options.
   * @param options - Index options when fields are given separately.
   */
  async addIndex(
    table: TableName,
    fieldsOrOptions: readonly IndexField[] | IndexOptions,
    options: IndexOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#indexes.addIndex(table, fieldsOrOptions, options);
  }

  /**
   * Drops an index by name or by its fields (default name).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param nameOrFields - Index name or indexed fields.
   * @param options - `concurrently` and query options.
   */
  async removeIndex(
    table: TableName,
    nameOrFields: string | readonly IndexField[],
    options: QueryOptionsBase & Readonly<{ concurrently?: boolean }> = {},
  ): Promise<void> {
    await this.#indexes.removeIndex(table, nameOrFields, options);
  }

  /**
   * Adds a constraint.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Constraint definition.
   */
  async addConstraint(
    table: TableName,
    options: ConstraintOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#indexes.addConstraint(table, options);
  }

  /**
   * Drops a constraint.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Constraint name.
   * @param options - Query options.
   */
  async removeConstraint(
    table: TableName,
    name: string,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#indexes.removeConstraint(table, name, options);
  }

  /**
   * Drops an enum type.
   *
   * @param name - Enum type name.
   * @param options - Query options.
   */
  async dropEnum(name: string, options?: QueryOptionsBase): Promise<void> {
    await this.#enums.dropEnum(name, options);
  }

  /**
   * Drops all enum types of the current schema.
   *
   * @param options - Query options.
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
   * Inserts rows (used by seeders). Values are bound as parameters.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param records - Rows keyed by column name.
   * @param options - Query options.
   * @returns Number of inserted rows.
   */
  async bulkInsert(
    table: TableName,
    records: readonly Readonly<Record<string, unknown>>[],
    options: QueryOptionsBase = {},
  ): Promise<number> {
    return await this.#bulk.bulkInsert(table, records, options);
  }

  /**
   * Updates rows matching `where`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param values - New column values.
   * @param where - Filter (where object keyed by column).
   * @param options - Query options.
   * @returns Number of updated rows.
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
   * Deletes rows matching `where`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param where - Filter (where object keyed by column); empty deletes all rows.
   * @param options - Query options.
   * @returns Number of deleted rows.
   */
  async bulkDelete(
    table: TableName,
    where: unknown = {},
    options: QueryOptionsBase = {},
  ): Promise<number> {
    return await this.#bulk.bulkDelete(table, where, options);
  }
}
