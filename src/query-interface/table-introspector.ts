import { Deferrable, type DeferrableValue } from '../ddl/ddl-types.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { ColumnDescriber } from './column-describer.ts';
import type { ColumnDescription, ForeignKeyReference } from './query-interface-types.ts';
import type { StatementRunner } from './statement-runner.ts';

// the columns Sequelize v6 reports for a foreign key, returned with camel-cased names
const FOREIGN_KEY_COLUMNS = [
  'tc.constraint_name',
  'tc.constraint_schema',
  'tc.constraint_catalog',
  'tc.table_name',
  'tc.table_schema',
  'tc.table_catalog',
  'tc.initially_deferred',
  'tc.is_deferrable',
  'kcu.column_name',
  'ccu.table_schema AS referenced_table_schema',
  'ccu.table_catalog AS referenced_table_catalog',
  'ccu.table_name AS referenced_table_name',
  'ccu.column_name AS referenced_column_name',
].join(', ');

const camelized = (name: string): string =>
  name.replace(/_(\w)/g, (_match, char: string) => char.toUpperCase());

const deferrableOf = (deferrable: unknown, deferred: unknown): DeferrableValue => {
  if (deferrable === 'NO') {
    return Deferrable.NOT;
  }
  return deferred === 'NO' ? Deferrable.INITIALLY_IMMEDIATE : Deferrable.INITIALLY_DEFERRED;
};

const reference = (row: Readonly<Record<string, unknown>>): ForeignKeyReference => {
  const { is_deferrable: deferrable, initially_deferred: deferred, ...names } = row;
  const fields = Object.entries(names).map(([key, value]) => [camelized(key), String(value)]);
  return {
    ...(Object.fromEntries(fields) as Omit<ForeignKeyReference, 'deferrable'>),
    deferrable: deferrableOf(deferrable, deferred),
  };
};

const sqlLiteral = new SqlLiteral();

const columnDescriber = new ColumnDescriber();

/**
 * Catalog lookups of `QueryInterface`: schemas, tables, columns and foreign keys. Every lookup
 * filters by schema (the given one or `current_schema()`); values are escaped literals.
 *
 * @internal
 */
export class TableIntrospector {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Lists user schemas.
   *
   * @param options - Query options.
   * @returns Schema names.
   */
  async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
    const rows = await this.#runner.run(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name <> 'public' AND schema_name !~ E'^pg_' ORDER BY schema_name",
      options,
    );
    return rows.map((row) => String(row['schema_name']));
  }

  /**
   * Checks whether a table exists.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns True when the table exists.
   */
  async tableExists(table: TableName, options?: QueryOptionsBase): Promise<boolean> {
    const { name, schema } = sqlLiteral.tableParts(table);
    const rows = await this.#runner.run(
      `SELECT 1 FROM information_schema.tables WHERE table_name = ${sqlLiteral.escape(name)} AND table_schema = ${this.#schemaSql(schema)}`,
      options,
    );
    return rows.length > 0;
  }

  /**
   * Lists tables of the current schema.
   *
   * @param options - Query options.
   * @returns Table names.
   */
  async showAllTables(options?: QueryOptionsBase): Promise<string[]> {
    const rows = await this.#runner.run(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type LIKE '%TABLE' AND table_name <> 'spatial_ref_sys' ORDER BY table_name",
      options,
    );
    return rows.map((row) => String(row['table_name']));
  }

  /**
   * Describes the columns of a table.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `schema` and query options.
   * @returns Column descriptions keyed by column name.
   * @throws Error when the table does not exist.
   */
  async describeTable(
    table: TableName,
    options: QueryOptionsBase & Readonly<{ schema?: string }>,
  ): Promise<Record<string, ColumnDescription>> {
    const { name, schema } = sqlLiteral.tableParts(table, options.schema);
    const rows = await this.#runner.run(this.#describeSql(name, this.#schemaSql(schema)), options);
    if (rows.length === 0) {
      throw new Error(
        `No description found for table ${name}. Check the table name and schema; remember, they _are_ case sensitive.`,
      );
    }
    return columnDescriber.describe(rows);
  }

  /**
   * Foreign keys of a table.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns Constraint name, column and referenced table/column per foreign key column.
   */
  async getForeignKeyReferencesForTable(
    table: TableName,
    options?: QueryOptionsBase,
  ): Promise<ForeignKeyReference[]> {
    const { name, schema } = sqlLiteral.tableParts(table);
    const rows = await this.#runner.run(
      `SELECT ${FOREIGN_KEY_COLUMNS} FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = ${sqlLiteral.escape(name)} AND tc.table_schema = ${this.#schemaSql(schema)}`,
      options,
    );
    return rows.map(reference);
  }

  #schemaSql(schema: string | undefined): string {
    return schema === undefined ? 'current_schema()' : sqlLiteral.escape(schema);
  }

  #describeSql(name: string, schemaSql: string): string {
    return `SELECT pk.constraint_type AS "Constraint", c.column_name AS "Field", c.column_default AS "Default", c.is_nullable AS "Null", (CASE WHEN c.udt_name = 'hstore' THEN c.udt_name ELSE c.data_type END) || (CASE WHEN c.character_maximum_length IS NOT NULL THEN '(' || c.character_maximum_length || ')' ELSE '' END) AS "Type", (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid WHERE t.typname = c.udt_name AND tn.nspname = c.udt_schema) AS "special", (SELECT pgd.description FROM pg_catalog.pg_statio_all_tables AS st INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid) WHERE c.ordinal_position = pgd.objsubid AND c.table_name = st.relname AND st.schemaname = c.table_schema) AS "Comment" FROM information_schema.columns c LEFT JOIN (SELECT tc.table_schema, tc.table_name, cu.column_name, tc.constraint_type FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage cu ON tc.table_schema = cu.table_schema AND tc.table_name = cu.table_name AND tc.constraint_name = cu.constraint_name AND tc.constraint_type = 'PRIMARY KEY') pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name WHERE c.table_name = ${sqlLiteral.escape(name)} AND c.table_schema = ${schemaSql} ORDER BY c.ordinal_position`;
  }
}
