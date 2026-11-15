import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { SqlAst, type ExprNode, type TableRef } from '../sql/ast.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import type { StatementRunner } from './statement-runner.ts';

const ast = new SqlAst();

const sqlLiteral = new SqlLiteral();

const sqlCompiler = new SqlCompiler();

const identity = new WhereCompiler({ resolve: (name) => ({ field: name }) });

/**
 * Bulk data methods of `QueryInterface` (seeders). Values are bound as parameters; `where` objects
 * are keyed by column.
 *
 * @internal
 */
export class BulkData {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Inserts rows; missing values become `DEFAULT`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param records - Rows keyed by column name.
   * @param options - Query options.
   * @returns Number of inserted rows.
   */
  async bulkInsert(
    table: TableName,
    records: readonly Readonly<Record<string, unknown>>[],
    options: QueryOptionsBase,
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }
    const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const target = this.#table(table);
    const rows = records.map((record) => columns.map((column) => this.#value(record[column])));
    const query = sqlCompiler.compile({ kind: 'insert', table: target, columns, rows });
    return (await this.#runner.execute(query, options)).rowCount;
  }

  /**
   * Updates rows matching `where`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param values - New column values.
   * @param where - Filter.
   * @param options - Query options.
   * @returns Number of updated rows.
   */
  async bulkUpdate(
    table: TableName,
    values: Readonly<Record<string, unknown>>,
    where: unknown,
    options: QueryOptionsBase,
  ): Promise<number> {
    const query = sqlCompiler.compile({
      kind: 'update',
      table: this.#table(table),
      set: Object.entries(values).map(([column, value]) => ({
        column,
        value: identity.toExpr(value),
      })),
      ...this.#where(where),
    });
    return (await this.#runner.execute(query, options)).rowCount;
  }

  /**
   * Deletes rows matching `where`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param where - Filter; empty deletes all rows.
   * @param options - Query options.
   * @returns Number of deleted rows.
   */
  async bulkDelete(table: TableName, where: unknown, options: QueryOptionsBase): Promise<number> {
    const query = sqlCompiler.compile({
      kind: 'delete',
      table: this.#table(table),
      ...this.#where(where),
    });
    return (await this.#runner.execute(query, options)).rowCount;
  }

  #table(table: TableName): TableRef {
    const { name, schema } = sqlLiteral.tableParts(table);
    return { name, ...(schema === undefined ? {} : { schema }) };
  }

  #value(value: unknown): ExprNode {
    return value === undefined ? ast.raw('DEFAULT') : identity.toExpr(value);
  }

  #where(where: unknown): Readonly<{ where?: ExprNode }> {
    return WhereCompiler.isEmpty(where) ? {} : { where: identity.compile(where) };
  }
}
