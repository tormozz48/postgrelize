import inflection from 'inflection';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { DdlGuards } from './ddl-guards.ts';
import type { IndexField, IndexOptions } from './ddl-types.ts';
import { IndexElementDdl } from './index-element-ddl.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new DdlGuards();

const elements = new IndexElementDdl();

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
    const names = fields.map((field) => {
      const name = typeof field === 'string' ? field : field.name;
      if (name === undefined) {
        throw new Error('An index on an expression requires an explicit name');
      }
      return name;
    });
    return inflection
      .underscore(`${sqlLiteral.tableParts(table).name}_${names.join('_')}`)
      .replaceAll('.', '_');
  }

  /**
   * `CREATE [UNIQUE] INDEX` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Index options.
   * @param defaultSchema - Schema used when the table reference has none.
   * @returns Statement.
   * @throws Error without fields, with an invalid method / operator class, or with an expression
   * field and no name.
   */
  createIndexSql(table: TableName, options: IndexOptions, defaultSchema?: string): string {
    const fields = options.fields ?? [];
    if (fields.length === 0) {
      throw new Error('Index requires at least one field');
    }
    const columns = fields.map((field) => elements.elementSql(field, options.operator)).join(', ');
    const where = this.#whereSql(options.where);
    return [
      this.#head(options),
      `${SqlCompiler.quoteIdent(options.name ?? this.indexName(table, fields))} ON ${sqlLiteral.quoteTable(table, defaultSchema)}`,
      options.using === undefined ? '' : ` USING ${guards.word(options.using, 'index method')}`,
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
}
