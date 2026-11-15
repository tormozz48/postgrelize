import { SqlCompiler } from '../sql/compile.ts';
import type { ColumnDefinition } from './ddl-types.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const sqlLiteral = new SqlLiteral();

/**
 * PostgreSQL enum types of `ENUM` and `ARRAY(ENUM)` columns (`enum_<table>_<column>`, v6).
 *
 * @internal
 */
export class EnumDdl {
  /**
   * Name of the PostgreSQL enum type of a column (`enum_<table>_<column>`, v6).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param field - Column name.
   * @returns Unquoted enum type name.
   */
  typeName(table: TableName, field: string): string {
    return `enum_${sqlLiteral.tableParts(table).name}_${field}`;
  }

  /**
   * Quoted, schema-qualified enum type of a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param field - Column name.
   * @returns Quoted type name.
   */
  quotedType(table: TableName, field: string): string {
    const { schema } = sqlLiteral.tableParts(table);
    const name = SqlCompiler.quoteIdent(this.typeName(table, field));
    return schema === undefined ? name : `${SqlCompiler.quoteIdent(schema)}.${name}`;
  }

  /**
   * `CREATE TYPE ... AS ENUM` wrapped so an existing type is not an error (v6).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns Statement, or `undefined` for non-enum columns.
   */
  createSql(table: TableName, column: ColumnDefinition): string | undefined {
    const values = this.#values(column);
    if (values === undefined) {
      return undefined;
    }
    const body = `CREATE TYPE ${this.quotedType(table, column.field)} AS ENUM(${values.map((value) => sqlLiteral.escape(value)).join(', ')}); EXCEPTION WHEN duplicate_object THEN null;`;
    return `DO ${sqlLiteral.escape(`BEGIN ${body} END`)}`;
  }

  /**
   * `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for every enum value of a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns Statements; empty for non-enum columns.
   */
  addValuesSql(table: TableName, column: ColumnDefinition): readonly string[] {
    return (this.#values(column) ?? []).map(
      (value) =>
        `ALTER TYPE ${this.quotedType(table, column.field)} ADD VALUE IF NOT EXISTS ${sqlLiteral.escape(value)}`,
    );
  }

  #values(column: ColumnDefinition): readonly string[] | undefined {
    return column.type.key === 'ENUM'
      ? column.type.values
      : column.type.subtype?.key === 'ENUM'
        ? column.type.subtype.values
        : undefined;
  }
}
