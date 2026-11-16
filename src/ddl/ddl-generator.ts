import type { AttributeDefinition } from '../model/model-definition.ts';
import { ColumnDdl } from './column-ddl.ts';
import { ConstraintDdl } from './constraint-ddl.ts';
import { DdlGuards } from './ddl-guards.ts';
import type {
  ColumnDefinition,
  ConstraintOptions,
  CreateTableOptions,
  DeferrableValue,
  IndexField,
  IndexOptions,
} from './ddl-types.ts';
import { EnumDdl } from './enum-ddl.ts';
import { IndexDdl } from './index-ddl.ts';
import type { TableName } from './sql-literal.ts';
import { TableDdl } from './table-ddl.ts';

export {
  Deferrable,
  type ColumnDefinition,
  type ConstraintOptions,
  type DeferrableValue,
  type IndexField,
  type IndexOptions,
} from './ddl-types.ts';

const guards = new DdlGuards();

/**
 * Generates DDL statements (tables, columns, enum types, indexes, constraints, comments,
 * references) for PostgreSQL. Values are inlined as escaped literals.
 *
 * @internal
 */
export class DdlGenerator {
  readonly #enums = new EnumDdl();
  readonly #columns = new ColumnDdl(this.#enums);
  readonly #tables = new TableDdl(this.#columns, this.#enums);
  readonly #indexes = new IndexDdl();
  readonly #constraints = new ConstraintDdl();

  /**
   * SQL of a `Deferrable` value; anything that is not one of them is rejected.
   *
   * @internal
   */
  static deferrableSql(value: DeferrableValue): string {
    return guards.deferrableSql(value);
  }

  /**
   * Converts a normalized attribute to a column definition.
   *
   * @param attribute - Normalized attribute.
   * @returns Column definition.
   */
  columnOf(attribute: AttributeDefinition): ColumnDefinition {
    return this.#columns.columnOf(attribute);
  }

  /**
   * Name of the PostgreSQL enum type of a column (`enum_<table>_<column>`, v6).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param field - Column name.
   * @returns Unquoted enum type name.
   */
  enumTypeName(table: TableName, field: string): string {
    return this.#enums.typeName(table, field);
  }

  /**
   * SQL type of a column (SERIAL for auto-increment integers, enum type names).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns SQL type.
   */
  columnType(table: TableName, column: ColumnDefinition): string {
    return this.#columns.columnType(table, column);
  }

  /**
   * `DEFAULT ...` clause value.
   *
   * @param column - Column definition.
   * @returns SQL of the default, or `undefined` for client-side defaults.
   */
  defaultSql(column: ColumnDefinition): string | undefined {
    return this.#columns.defaultSql(column);
  }

  /**
   * `REFERENCES ...` clause.
   *
   * @param column - Column definition.
   * @param defaultSchema - Schema of the referenced table when it has none.
   * @returns SQL of the clause, or `undefined` without references.
   */
  referencesSql(column: ColumnDefinition, defaultSchema?: string): string | undefined {
    return this.#columns.referencesSql(column, defaultSchema);
  }

  /**
   * One column of `CREATE TABLE` / `ADD COLUMN`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @param options - `inlinePrimaryKey` and the default schema of references.
   * @returns Column SQL.
   */
  columnSql(
    table: TableName,
    column: ColumnDefinition,
    options: Readonly<{ inlinePrimaryKey?: boolean; defaultSchema?: string }> = {},
  ): string {
    return this.#columns.columnSql(table, column, options);
  }

  /**
   * `CREATE TYPE ... AS ENUM` wrapped so an existing type is not an error (v6).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns Statement, or `undefined` for non-enum columns.
   */
  createEnumSql(table: TableName, column: ColumnDefinition): string | undefined {
    return this.#enums.createSql(table, column);
  }

  /**
   * Statements creating a table: enum types, `CREATE TABLE IF NOT EXISTS`, comments.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param columns - Column definitions.
   * @param options - Table comment, persistence (`unlogged`, `temporary`), default schema and `ifNotExists` (default true).
   * @returns Statements in execution order.
   */
  createTableSql(
    table: TableName,
    columns: readonly ColumnDefinition[],
    options: CreateTableOptions = {},
  ): readonly string[] {
    return this.#tables.createTableSql(table, columns, options);
  }

  /**
   * `COMMENT ON COLUMN` for a column with a comment.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name and comment.
   * @returns The statement, or nothing without a comment.
   */
  columnCommentSql(
    table: TableName,
    column: Readonly<{ field: string; comment?: string }>,
  ): readonly string[] {
    return this.#columns.commentSql(table, column);
  }

  /**
   * `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for every enum value of a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns Statements; empty for non-enum columns.
   */
  addEnumValuesSql(table: TableName, column: ColumnDefinition): readonly string[] {
    return this.#enums.addValuesSql(table, column);
  }

  /**
   * `ALTER TABLE ... ALTER COLUMN` statements bringing a column to its definition (v6 changeColumn).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @param defaultSchema - Schema used when the table reference has none.
   * @returns Statements in execution order.
   */
  changeColumnSql(
    table: TableName,
    column: ColumnDefinition,
    defaultSchema?: string,
  ): readonly string[] {
    return this.#tables.changeColumnSql(table, column, defaultSchema);
  }

  /**
   * Default index name (v6 `Utils.nameIndex`).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param fields - Indexed fields.
   * @returns Index name.
   */
  indexName(table: TableName, fields: readonly IndexField[]): string {
    return this.#indexes.indexName(table, fields);
  }

  /**
   * `CREATE [UNIQUE] INDEX` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Index options.
   * @param defaultSchema - Schema used when the table reference has none.
   * @returns Statement.
   * @throws Error without fields or with an invalid method / operator class.
   */
  createIndexSql(table: TableName, options: IndexOptions, defaultSchema?: string): string {
    return this.#indexes.createIndexSql(table, options, defaultSchema);
  }

  /**
   * `ALTER TABLE ... ADD CONSTRAINT` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Constraint definition.
   * @param defaultSchema - Schema used when a table reference has none.
   * @returns Statement.
   * @throws Error for an unknown constraint type or a foreign key without references.
   */
  addConstraintSql(table: TableName, options: ConstraintOptions, defaultSchema?: string): string {
    return this.#constraints.addConstraintSql(table, options, defaultSchema);
  }
}
