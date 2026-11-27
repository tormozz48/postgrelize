import type { DataTypeInput } from '../data-types/data-types.ts';
import { DdlGenerator, type ColumnDefinition } from '../ddl/ddl-generator.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import { ModelDefinition, type AttributeOptions } from '../model/model-definition.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { SqlCompiler } from '../sql/compile.ts';
import type { StatementRunner } from './statement-runner.ts';

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/**
 * Column DDL of `QueryInterface`: add, remove, change and rename. Names are quoted identifiers.
 *
 * @internal
 */
export class ColumnCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Adds a column and its enum type and comment.
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
    ColumnCommands.#requireArguments(table, column, attribute);
    const definition = this.#column(column, attribute);
    const enumSql = ddl.createEnumSql(table, definition);
    await this.#runner.runAll(
      [
        ...(enumSql === undefined ? [] : [enumSql]),
        `ALTER TABLE ${sqlLiteral.quoteTable(table)} ADD COLUMN ${ddl.columnSql(table, definition, { inlinePrimaryKey: true })}`,
        ...ddl.columnCommentSql(table, definition),
      ],
      options,
    );
  }

  /**
   * Removes a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param options - Query options.
   */
  async removeColumn(table: TableName, column: string, options?: QueryOptionsBase): Promise<void> {
    await this.#runner.run(
      `ALTER TABLE ${sqlLiteral.quoteTable(table)} DROP COLUMN ${SqlCompiler.quoteIdent(column)}`,
      options,
    );
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
    await this.#runner.runAll(ddl.changeColumnSql(table, this.#column(column, attribute)), options);
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
    try {
      await this.#runner.run(
        `ALTER TABLE ${sqlLiteral.quoteTable(table)} RENAME COLUMN ${SqlCompiler.quoteIdent(before)} TO ${SqlCompiler.quoteIdent(after)}`,
        options,
      );
    } catch (error) {
      throw ColumnCommands.#missingColumn(error, table, before);
    }
  }

  static #requireArguments(...given: readonly unknown[]): void {
    if (given.some((value) => !value)) {
      throw new Error(
        'addColumn takes at least 3 arguments (table, attribute name, attribute definition)',
      );
    }
  }

  // v6 describes the table first and reports a missing column itself
  static #missingColumn(error: unknown, table: TableName, column: string): unknown {
    const code = (error as { original?: { code?: string } }).original?.code;
    return code === '42703'
      ? new Error(`Table ${sqlLiteral.tableParts(table).name} doesn't have the column ${column}`)
      : error;
  }

  #column(name: string, attribute: DataTypeInput | AttributeOptions): ColumnDefinition {
    return ddl.columnOf(ModelDefinition.attribute(name, attribute, false));
  }
}
