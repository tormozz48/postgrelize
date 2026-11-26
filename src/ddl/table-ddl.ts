import { SqlCompiler } from '../sql/compile.ts';
import type { ColumnDdl } from './column-ddl.ts';
import type { ColumnDefinition, CreateTableOptions } from './ddl-types.ts';
import type { EnumDdl } from './enum-ddl.ts';
import { PartitionDdl } from './partition-ddl.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const sqlLiteral = new SqlLiteral();

const partitions = new PartitionDdl();

type NamedUniqueKey = Readonly<{ fields: readonly string[]; nullsNotDistinct: boolean }>;

/**
 * `CREATE TABLE` (with enum types, keys and comments) and `ALTER COLUMN` statements.
 *
 * @internal
 */
export class TableDdl {
  readonly #columns: ColumnDdl;
  readonly #enums: EnumDdl;

  /**
   * @param columns - Column parts.
   * @param enums - Enum types.
   */
  constructor(columns: ColumnDdl, enums: EnumDdl) {
    this.#columns = columns;
    this.#enums = enums;
  }

  /**
   * Statements creating a table: enum types, `CREATE TABLE IF NOT EXISTS`, comments.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param columns - Column definitions.
   * @param options - Table comment, default schema and `ifNotExists` (default true).
   * @returns Statements in execution order.
   */
  createTableSql(
    table: TableName,
    columns: readonly ColumnDefinition[],
    options: CreateTableOptions = {},
  ): readonly string[] {
    this.#checkPersistence(table, options);
    const defaultSchema = options.temporary === true ? undefined : options.defaultSchema;
    const body = this.#tableBody(table, columns, defaultSchema);
    const qualified = sqlLiteral.quoteTable(table, defaultSchema);
    return [
      ...columns
        .map((column) => this.#enums.createSql(table, column))
        .filter((sql): sql is string => sql !== undefined),
      `CREATE ${this.#persistence(options)}TABLE ${options.ifNotExists === false ? '' : 'IF NOT EXISTS '}${qualified} (${body})${options.partitionBy === undefined ? '' : partitions.partitionBySql(options.partitionBy)}`,
      ...(options.comment === undefined
        ? []
        : [`COMMENT ON TABLE ${qualified} IS ${sqlLiteral.escape(options.comment)}`]),
      ...columns.flatMap((column) => this.#columns.commentSql(table, column)),
    ];
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
    const qualified = sqlLiteral.quoteTable(table, defaultSchema);
    const target = `ALTER TABLE ${qualified} ALTER COLUMN ${SqlCompiler.quoteIdent(column.field)}`;
    const references = this.#columns.referencesSql(column, defaultSchema);
    if (references !== undefined) {
      return this.#addForeignKey(table, column, qualified, references);
    }
    return this.#alterColumn(table, column, target);
  }

  #alterColumn(table: TableName, column: ColumnDefinition, target: string): readonly string[] {
    const value = this.#columns.defaultSql(column);
    const enumSql = this.#enums.createSql(table, column);
    const type = this.#columns.columnType(table, { ...column, autoIncrement: false });
    return [
      `${target} ${column.allowNull ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
      ...(column.autoIncrement === true && value === undefined
        ? []
        : [value === undefined ? `${target} DROP DEFAULT` : `${target} SET DEFAULT ${value}`]),
      ...(enumSql === undefined ? [] : [enumSql]),
      `${target} TYPE ${type}${column.type.key === 'ENUM' ? ` USING (${SqlCompiler.quoteIdent(column.field)}::${type})` : ''}`,
      ...this.#columns.commentSql(table, column),
    ];
  }

  // like v6, a column with `references` gets the foreign key (and NOT NULL / DEFAULT when given)
  // and keeps its type and everything else
  #addForeignKey(
    table: TableName,
    column: ColumnDefinition,
    qualified: string,
    references: string,
  ): readonly string[] {
    const name = SqlCompiler.quoteIdent(column.field);
    const target = `ALTER TABLE ${qualified} ALTER COLUMN ${name}`;
    const value = this.#columns.defaultSql(column);
    return [
      ...(column.allowNull ? [] : [`${target} SET NOT NULL`]),
      ...(value === undefined ? [] : [`${target} SET DEFAULT ${value}`]),
      `ALTER TABLE ${qualified} ADD FOREIGN KEY (${name}) ${references}`,
      ...this.#columns.commentSql(table, column),
    ];
  }

  #persistence(options: CreateTableOptions): string {
    return options.temporary === true ? 'TEMPORARY ' : options.unlogged === true ? 'UNLOGGED ' : '';
  }

  #checkPersistence(table: TableName, options: CreateTableOptions): void {
    if (options.temporary === true && options.unlogged === true) {
      throw new Error('A table cannot be both temporary and unlogged');
    }
    if (options.temporary === true && sqlLiteral.tableParts(table).schema !== undefined) {
      throw new Error('A temporary table lives in the session schema and cannot have a schema');
    }
  }

  #tableBody(
    table: TableName,
    columns: readonly ColumnDefinition[],
    defaultSchema: string | undefined,
  ): string {
    const primaryKey = this.#primaryKeyConstraint(columns);
    const uniqueKeys = this.#uniqueKeyConstraints(columns);
    return [
      ...columns.map((column) =>
        this.#columns.columnSql(
          table,
          column,
          defaultSchema === undefined ? {} : { defaultSchema },
        ),
      ),
      ...uniqueKeys,
      ...primaryKey,
    ].join(', ');
  }

  #primaryKeyConstraint(columns: readonly ColumnDefinition[]): readonly string[] {
    const primaryKeys = columns
      .filter((column) => column.primaryKey)
      .map((column) => SqlCompiler.quoteIdent(column.field));
    return primaryKeys.length === 0 ? [] : [`PRIMARY KEY (${primaryKeys.join(', ')})`];
  }

  #uniqueKeyConstraints(columns: readonly ColumnDefinition[]): readonly string[] {
    return [...this.#namedUniqueKeys(columns)].map(
      ([name, key]) =>
        `CONSTRAINT ${SqlCompiler.quoteIdent(name)} UNIQUE${key.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''} (${key.fields.map(SqlCompiler.quoteIdent).join(', ')})`,
    );
  }

  /** Named unique keys: name → fields, with the NULLS NOT DISTINCT flag. */
  #namedUniqueKeys(columns: readonly ColumnDefinition[]): ReadonlyMap<string, NamedUniqueKey> {
    return columns.reduce((keys, column) => {
      const name = this.#uniqueName(column.unique);
      if (name === undefined) {
        return keys;
      }
      const existing = keys.get(name);
      const nullsNotDistinct =
        (existing?.nullsNotDistinct ?? false) || this.#columns.nullsNotDistinct(column.unique);
      return new Map([
        ...keys,
        [name, { fields: [...(existing?.fields ?? []), column.field], nullsNotDistinct }],
      ]);
    }, new Map<string, NamedUniqueKey>());
  }

  #uniqueName(unique: ColumnDefinition['unique']): string | undefined {
    return typeof unique === 'string'
      ? unique
      : typeof unique === 'object' && unique !== null
        ? unique.name
        : undefined;
  }
}
