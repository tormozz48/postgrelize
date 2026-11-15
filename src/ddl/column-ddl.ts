import { DefaultValueGenerator } from '../data-types/default-value-generator.ts';
import { SqlExpression } from '../expressions/methods.ts';
import type { AttributeDefinition } from '../model/model-definition.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { DdlGuards } from './ddl-guards.ts';
import type { ColumnDefinition, ColumnSqlOptions, DeferrableValue } from './ddl-types.ts';
import type { EnumDdl } from './enum-ddl.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new DdlGuards();

const noContext = new WhereCompiler({ resolve: () => undefined });

const sqlLiteral = new SqlLiteral();

/**
 * Column parts of DDL: the SQL type, `DEFAULT`, `REFERENCES`, column definitions and comments.
 *
 * @internal
 */
export class ColumnDdl {
  readonly #enums: EnumDdl;

  /**
   * @param enums - Enum type names.
   */
  constructor(enums: EnumDdl) {
    this.#enums = enums;
  }

  /**
   * Converts a normalized attribute to a column definition.
   *
   * @param attribute - Normalized attribute.
   * @returns Column definition.
   */
  columnOf(attribute: AttributeDefinition): ColumnDefinition {
    return {
      name: attribute.fieldName,
      field: attribute.field,
      type: attribute.type,
      allowNull: attribute.allowNull,
      primaryKey: attribute.primaryKey === true,
      autoIncrement: attribute.autoIncrement === true,
      defaultValue: attribute.defaultValue,
      unique: attribute.unique,
      comment: attribute.comment,
      references: attribute.references,
      onDelete: attribute.onDelete,
      onUpdate: attribute.onUpdate,
      identity: attribute.identity,
      generated: attribute.generated,
    };
  }

  /**
   * SQL type of a column (SERIAL for auto-increment integers, enum type names).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns SQL type.
   */
  columnType(table: TableName, column: ColumnDefinition): string {
    if (column.identity !== undefined) {
      return `${column.type.sqlType} GENERATED ${column.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
    }
    if (column.autoIncrement) {
      return this.#serialType(column);
    }
    if (column.type.key === 'ENUM') {
      return this.#enums.quotedType(table, column.field);
    }
    if (column.type.key === 'ARRAY' && column.type.subtype?.key === 'ENUM') {
      return `${this.#enums.quotedType(table, column.field)}[]`;
    }
    return column.type.sqlType;
  }

  /**
   * `DEFAULT ...` clause value.
   *
   * @param column - Column definition.
   * @returns SQL of the default, or `undefined` for client-side defaults.
   */
  defaultSql(column: ColumnDefinition): string | undefined {
    const value = column.defaultValue;
    if (value === undefined || column.autoIncrement || column.generated !== undefined) {
      return undefined;
    }
    if (value instanceof DefaultValueGenerator) {
      return value.key === 'NOW' ? 'now()' : undefined;
    }
    if (value instanceof SqlExpression) {
      return sqlLiteral.inlineExpr(noContext.toExpr(value));
    }
    return column.type.isJson === true
      ? sqlLiteral.escape(JSON.stringify(value))
      : sqlLiteral.escape(value);
  }

  /**
   * `REFERENCES ...` clause.
   *
   * @param column - Column definition.
   * @param defaultSchema - Schema of the referenced table when it has none.
   * @returns SQL of the clause, or `undefined` without references.
   */
  referencesSql(column: ColumnDefinition, defaultSchema?: string): string | undefined {
    const references = column.references;
    if (references === undefined) {
      return undefined;
    }
    const key = typeof references === 'string' ? 'id' : (references.key ?? 'id');
    const deferrable =
      typeof references === 'object'
        ? (references as { deferrable?: DeferrableValue }).deferrable
        : undefined;
    const target = `REFERENCES ${sqlLiteral.quoteTable(this.#referencedTable(references), defaultSchema)} (${SqlCompiler.quoteIdent(key)})`;
    return `${target}${guards.foreignKeySuffix(column.onDelete, column.onUpdate, deferrable)}`;
  }

  /**
   * One column of `CREATE TABLE` / `ADD COLUMN`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @param options - `inlinePrimaryKey` and the default schema of references.
   * @returns Column SQL.
   */
  columnSql(table: TableName, column: ColumnDefinition, options: ColumnSqlOptions = {}): string {
    return [
      `${SqlCompiler.quoteIdent(column.field)} ${this.columnType(table, column)}`,
      column.allowNull || column.primaryKey ? '' : ' NOT NULL',
      options.inlinePrimaryKey === true && column.primaryKey ? ' PRIMARY KEY' : '',
      this.#generatedSql(column),
      this.#uniqueSql(column.unique),
      this.#prefixed(' DEFAULT ', this.defaultSql(column)),
      this.#prefixed(' ', this.referencesSql(column, options.defaultSchema)),
    ].join('');
  }

  /**
   * `COMMENT ON COLUMN` for a column with a comment.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name and comment.
   * @returns The statement, or nothing without a comment.
   */
  commentSql(
    table: TableName,
    column: Readonly<{ field: string; comment?: string }>,
  ): readonly string[] {
    return column.comment === undefined
      ? []
      : [
          `COMMENT ON COLUMN ${sqlLiteral.quoteTable(table)}.${SqlCompiler.quoteIdent(column.field)} IS ${sqlLiteral.escape(column.comment)}`,
        ];
  }

  /**
   * Whether a `unique` option has `nullsNotDistinct: true`.
   *
   * @param unique - `unique` option of a column.
   * @returns The flag.
   */
  nullsNotDistinct(unique: ColumnDefinition['unique']): boolean {
    return (
      typeof unique === 'object' &&
      unique !== null &&
      (unique as { nullsNotDistinct?: boolean }).nullsNotDistinct === true
    );
  }

  #serialType(column: ColumnDefinition): string {
    return column.type.key === 'BIGINT'
      ? 'BIGSERIAL'
      : column.type.key === 'SMALLINT'
        ? 'SMALLSERIAL'
        : 'SERIAL';
  }

  #generatedSql(column: ColumnDefinition): string {
    return column.generated === undefined
      ? ''
      : ` GENERATED ALWAYS AS (${sqlLiteral.inlineExpr(noContext.toExpr(column.generated.as))}) ${column.generated.stored === false ? 'VIRTUAL' : 'STORED'}`;
  }

  #uniqueSql(unique: ColumnDefinition['unique']): string {
    const unnamed =
      unique === true ||
      (typeof unique === 'object' && unique !== null && unique.name === undefined);
    if (!unnamed) {
      return '';
    }
    return this.nullsNotDistinct(unique) ? ' UNIQUE NULLS NOT DISTINCT' : ' UNIQUE';
  }

  #prefixed(prefix: string, sql: string | undefined): string {
    return sql === undefined ? '' : `${prefix}${sql}`;
  }

  #referencedTable(references: NonNullable<ColumnDefinition['references']>): TableName {
    return typeof references === 'string'
      ? references
      : typeof references.model === 'string'
        ? references.model
        : (references.model as Readonly<{ tableName: string; schema?: string }>);
  }
}
