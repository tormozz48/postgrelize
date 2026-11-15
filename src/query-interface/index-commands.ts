import {
  DdlGenerator,
  type ConstraintOptions,
  type IndexField,
  type IndexOptions,
} from '../ddl/ddl-generator.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { SqlCompiler } from '../sql/compile.ts';
import type { StatementRunner } from './statement-runner.ts';

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/**
 * Index and constraint DDL of `QueryInterface`. Names are quoted identifiers.
 *
 * @internal
 */
export class IndexCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
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
    options: IndexOptions & QueryOptionsBase,
  ): Promise<void> {
    const index: IndexOptions = Array.isArray(fieldsOrOptions)
      ? { ...options, fields: fieldsOrOptions as readonly IndexField[] }
      : { ...(fieldsOrOptions as IndexOptions), ...options };
    await this.#runner.run(ddl.createIndexSql(table, index), options);
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
    options: QueryOptionsBase & Readonly<{ concurrently?: boolean }>,
  ): Promise<void> {
    const { schema } = sqlLiteral.tableParts(table);
    const name =
      typeof nameOrFields === 'string' ? nameOrFields : ddl.indexName(table, nameOrFields);
    const qualified =
      schema === undefined
        ? SqlCompiler.quoteIdent(name)
        : `${SqlCompiler.quoteIdent(schema)}.${SqlCompiler.quoteIdent(name)}`;
    await this.#runner.run(
      `DROP INDEX ${options.concurrently === true ? 'CONCURRENTLY ' : ''}IF EXISTS ${qualified}`,
      options,
    );
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
    await this.#runner.run(ddl.addConstraintSql(table, options), options);
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
    await this.#runner.run(
      `ALTER TABLE ${sqlLiteral.quoteTable(table)} DROP CONSTRAINT ${SqlCompiler.quoteIdent(name)}`,
      options,
    );
  }
}
