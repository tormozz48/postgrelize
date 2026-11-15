import inflection from 'inflection';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { DdlGuards } from './ddl-guards.ts';
import type { IndexField, IndexOptions } from './ddl-types.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const identity = new WhereCompiler({ resolve: (field) => ({ field }) });

const sqlLiteral = new SqlLiteral();

/**
 * `CREATE INDEX` statements and v6 default index names.
 *
 * @internal
 */
export class IndexDdl {
  /**
   * Default index name (v6 `Utils.nameIndex`).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param fields - Indexed fields.
   * @returns Index name.
   */
  indexName(table: TableName, fields: readonly IndexField[]): string {
    return inflection
      .underscore(
        `${sqlLiteral.tableParts(table).name}_${fields.map((field) => (typeof field === 'string' ? field : field.name)).join('_')}`,
      )
      .replaceAll('.', '_');
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
    const fields = options.fields ?? [];
    if (fields.length === 0) {
      throw new Error('Index requires at least one field');
    }
    const columns = fields.map((field) => this.#column(field, options.operator)).join(', ');
    const where = this.#whereSql(options.where);
    return [
      this.#head(options),
      `${SqlCompiler.quoteIdent(options.name ?? this.indexName(table, fields))} ON ${sqlLiteral.quoteTable(table, defaultSchema)}`,
      options.using === undefined ? '' : ` USING ${DdlGuards.word(options.using, 'index method')}`,
      ` (${columns})`,
      options.include === undefined || options.include.length === 0
        ? ''
        : ` INCLUDE (${options.include.map(SqlCompiler.quoteIdent).join(', ')})`,
      options.unique === true && options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : '',
      where,
    ].join('');
  }

  #whereSql(where: unknown): string {
    return where === undefined ? '' : ` WHERE ${sqlLiteral.inlineExpr(identity.compile(where))}`;
  }

  #head(options: IndexOptions): string {
    return `CREATE ${options.unique === true ? 'UNIQUE ' : ''}INDEX ${options.concurrently === true ? 'CONCURRENTLY ' : ''}${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}`;
  }

  #column(field: IndexField, operator: string | undefined): string {
    if (typeof field === 'string') {
      return `${SqlCompiler.quoteIdent(field)}${this.#operatorClass(operator)}`;
    }
    return [
      SqlCompiler.quoteIdent(field.name),
      field.collate === undefined ? '' : ` COLLATE ${SqlCompiler.quoteIdent(field.collate)}`,
      this.#operatorClass(field.operator ?? operator),
      field.order === undefined ? '' : ` ${field.order === 'DESC' ? 'DESC' : 'ASC'}`,
    ].join('');
  }

  #operatorClass(operator: string | undefined): string {
    return operator === undefined ? '' : ` ${DdlGuards.word(operator, 'operator class')}`;
  }
}
