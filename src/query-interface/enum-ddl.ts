import { DdlGenerator } from '../ddl/ddl-generator.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { SqlCompiler } from '../sql/compile.ts';
import type { StatementRunner } from './statement-runner.ts';

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/**
 * Enum type DDL of `QueryInterface`. Lookups filter by schema; names are quoted identifiers.
 *
 * @internal
 */
export class EnumDdl {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Drops an enum type.
   *
   * @param name - Enum type name.
   * @param options - Query options.
   */
  async dropEnum(name: string, options?: QueryOptionsBase): Promise<void> {
    await this.#runner.run(`DROP TYPE IF EXISTS ${SqlCompiler.quoteIdent(name)}`, options);
  }

  /**
   * Drops all enum types of the current schema.
   *
   * @param options - Query options.
   */
  async dropAllEnums(options?: QueryOptionsBase): Promise<void> {
    const rows = await this.#runner.run(
      "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = current_schema()",
      options,
    );
    await this.#runner.runAll(
      rows.map(
        (row) => `DROP TYPE IF EXISTS ${SqlCompiler.quoteIdent(String(row['typname']))} CASCADE`,
      ),
      options,
    );
  }

  /**
   * Drops the enum types of table columns.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param fields - Enum column names.
   * @param options - Query options.
   */
  async dropEnumsOf(
    table: TableName,
    fields: readonly string[],
    options?: QueryOptionsBase,
  ): Promise<void> {
    const { schema } = sqlLiteral.tableParts(table);
    await this.#runner.runAll(
      fields.map((field) => {
        const name = SqlCompiler.quoteIdent(ddl.enumTypeName(table, field));
        return `DROP TYPE IF EXISTS ${schema === undefined ? name : `${SqlCompiler.quoteIdent(schema)}.${name}`}`;
      }),
      options,
    );
  }
}
