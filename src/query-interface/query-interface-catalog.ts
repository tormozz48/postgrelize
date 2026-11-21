import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { IdentifierQuoter } from '../sql/identifier-quoter.ts';
import { QueryInterfacePartitions } from './query-interface-partitions.ts';
import type { ColumnDescription } from './query-interface-types.ts';
import { StatementRunner } from './statement-runner.ts';

const literals = new SqlLiteral();
const quoter = new IdentifierQuoter();

/** One column of an index in {@link IndexDescription}. */
export type IndexColumn = Readonly<{
  /** Column name. */
  attribute: string;
  /** `COLLATE` of the index column, when set. */
  collate: string | undefined;
  /** `ASC` or `DESC` when the index column states it. */
  order: 'ASC' | 'DESC' | undefined;
  /** Always `undefined` (v6 field for MySQL prefix lengths). */
  length: undefined;
}>;

/** One index of a table as returned by {@link QueryInterface.showIndex} (Sequelize v6 shape). */
export type IndexDescription = Readonly<{
  /** Index name. */
  name: string;
  /** Whether it backs the primary key. */
  primary: boolean;
  /** Whether it is unique. */
  unique: boolean;
  /** Column numbers, space separated (`pg_index.indkey`). */
  indkey: string;
  /** `CREATE INDEX` statement of the index. */
  definition: string;
  /** Indexed columns in order, without expression columns. */
  fields: readonly IndexColumn[];
}>;

/** Options of {@link QueryInterface.createDatabase}. */
export type CreateDatabaseOptions = QueryOptionsBase &
  Readonly<{
    /** `ENCODING`, e.g. `'UTF8'`. */
    encoding?: string;
    /** `LC_COLLATE`. */
    collate?: string;
    /** `LC_CTYPE`. */
    ctype?: string;
    /** `TEMPLATE` database. */
    template?: string;
  }>;

type Row = Readonly<Record<string, unknown>>;

const INDEX_SQL = `SELECT i.relname AS name, ix.indisprimary AS "primary", ix.indisunique AS "unique",
  ix.indkey::text AS indkey, pg_get_indexdef(ix.indexrelid) AS definition,
  array_agg(a.attnum) AS column_indexes, array_agg(a.attname::text) AS column_names
FROM pg_class t
JOIN pg_namespace s ON s.oid = t.relnamespace
JOIN pg_index ix ON ix.indrelid = t.oid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE t.relkind IN ('r', 'p') AND t.relname = $1 AND s.nspname = COALESCE($2, current_schema())
GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey
ORDER BY i.relname`;

const CONSTRAINT_SQL = `SELECT constraint_catalog AS "constraintCatalog", constraint_schema AS "constraintSchema",
  constraint_name AS "constraintName", table_catalog AS "tableCatalog", table_schema AS "tableSchema",
  table_name AS "tableName", constraint_type AS "constraintType", is_deferrable AS "isDeferrable",
  initially_deferred AS "initiallyDeferred"
FROM information_schema.table_constraints
WHERE table_name = $1 AND table_schema = COALESCE($2, current_schema()) AND ($3::text IS NULL OR constraint_name = $3)
ORDER BY constraint_name`;

const columnList = (definition: string): string[] =>
  (/ON .*? (?:USING .*?\s)?\(([^]*)\)/i.exec(definition)?.[1] ?? '').split(',');

const fieldOf = (attribute: string, part: string): IndexColumn => ({
  attribute,
  collate: /COLLATE "(.*?)"/.exec(part)?.[1],
  order: part.includes('DESC') ? 'DESC' : part.includes('ASC') ? 'ASC' : undefined,
  length: undefined,
});

const columnsOf = (row: Row): Map<string, string> =>
  new Map(
    (row['column_indexes'] as number[]).map((number, at) => [
      String(number),
      (row['column_names'] as string[])[at] as string,
    ]),
  );

const toIndex = (row: Row): IndexDescription => {
  const columns = columnsOf(row);
  const parts = columnList(String(row['definition']));
  const fields = String(row['indkey'])
    .split(' ')
    .flatMap((key, at) => {
      const attribute = columns.get(key);
      return attribute === undefined ? [] : [fieldOf(attribute, parts[at] ?? '')];
    });
  return {
    name: String(row['name']),
    primary: row['primary'] as boolean,
    unique: row['unique'] as boolean,
    indkey: String(row['indkey']),
    definition: String(row['definition']),
    fields,
  };
};

/**
 * Catalog helpers of {@link QueryInterface}: indexes, constraints, database creation, identifier quoting and
 * a few Sequelize v6 convenience lookups.
 */
export class QueryInterfaceCatalog extends QueryInterfacePartitions {
  readonly #catalog: StatementRunner;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    this.#catalog = new StatementRunner(sequelize);
  }

  /**
   * Lists the indexes of a table, with their columns, uniqueness and definition.
   *
   * @param table - Table name or `{ tableName, schema }`; `current_schema()` when no schema is given.
   * @param options - Query options.
   * @returns One entry per index, ordered by name.
   * @example
   * ```ts
   * const indexes = await queryInterface.showIndex('users');
   * const unique = indexes.filter((index) => index.unique).map((index) => index.name);
   * ```
   */
  async showIndex(table: TableName, options: QueryOptionsBase = {}): Promise<IndexDescription[]> {
    const { name, schema } = literals.tableParts(table);
    const result = await this.#catalog.execute(
      { text: INDEX_SQL, values: [name, schema ?? null] },
      options,
    );
    return result.rows.map(toIndex);
  }

  /**
   * Lists the constraints of a table (`information_schema.table_constraints`), optionally one by name.
   *
   * @param table - Table name or `{ tableName, schema }`; `current_schema()` when no schema is given.
   * @param constraintName - Only this constraint. Sequelize v6 ignores it for PostgreSQL and lists all.
   * @param options - Query options.
   * @returns Constraint rows (`constraintName`, `constraintType`, `isDeferrable`, ...), ordered by name.
   * @example
   * ```ts
   * const constraints = await queryInterface.showConstraint('users');
   * const names = constraints.map((constraint) => constraint.constraintName);
   * ```
   */
  async showConstraint(
    table: TableName,
    constraintName?: string | null,
    options: QueryOptionsBase = {},
  ): Promise<Row[]> {
    const { name, schema } = literals.tableParts(table);
    const result = await this.#catalog.execute(
      { text: CONSTRAINT_SQL, values: [name, schema ?? null, constraintName ?? null] },
      options,
    );
    return [...result.rows];
  }

  /**
   * Quotes an identifier for SQL: `"name"`, embedded double quotes are doubled.
   *
   * @param identifier - Identifier.
   * @param _force - Accepted for Sequelize v6 compatibility; identifiers are always quoted.
   * @returns Quoted identifier.
   * @example
   * ```ts
   * queryInterface.quoteIdentifier('user name'); // "user name"
   * ```
   */
  quoteIdentifier(identifier: string, _force?: boolean): string {
    return quoter.quote(identifier);
  }

  /**
   * Quotes a dotted identifier part by part: `schema.table` becomes `"schema"."table"`.
   *
   * @param identifiers - Dot separated identifiers.
   * @returns Quoted identifiers.
   * @example
   * ```ts
   * queryInterface.quoteIdentifiers('tenant.users'); // "tenant"."users"
   * ```
   */
  quoteIdentifiers(identifiers: string): string {
    return identifiers
      .split('.')
      .map((part) => quoter.quote(part))
      .join('.');
  }

  /**
   * Reads the PostgreSQL server version (`SHOW server_version`), e.g. `'17.2'`.
   *
   * @param options - Query options.
   * @returns Version string.
   * @example
   * ```ts
   * const version = await queryInterface.databaseVersion();
   * ```
   */
  async databaseVersion(options: QueryOptionsBase = {}): Promise<string> {
    const rows = await this.#catalog.run('SHOW server_version', options);
    return String(rows[0]?.['server_version'] ?? '').split(' ')[0] ?? '';
  }

  /**
   * Runs `CREATE DATABASE`. Must run outside a transaction.
   *
   * @param database - Database name (quoted).
   * @param options - `encoding`, `collate`, `ctype`, `template` (escaped as literals) and query options.
   * @example
   * ```ts
   * await queryInterface.createDatabase('tenant_42', { encoding: 'UTF8', template: 'template0' });
   * ```
   */
  async createDatabase(database: string, options: CreateDatabaseOptions = {}): Promise<void> {
    const { encoding, collate, ctype, template, ...query } = options;
    const clauses = [
      ['ENCODING', encoding],
      ['LC_COLLATE', collate],
      ['LC_CTYPE', ctype],
      ['TEMPLATE', template],
    ].flatMap(([key, value]) => (value ? [` ${key} = ${literals.escape(value)}`] : []));
    await this.#catalog.run(`CREATE DATABASE ${quoter.quote(database)}${clauses.join('')};`, query);
  }

  /**
   * Runs `DROP DATABASE IF EXISTS`. Must run outside a transaction.
   *
   * @param database - Database name (quoted).
   * @param options - Query options.
   * @example
   * ```ts
   * await queryInterface.dropDatabase('tenant_42');
   * ```
   */
  async dropDatabase(database: string, options: QueryOptionsBase = {}): Promise<void> {
    await this.#catalog.run(`DROP DATABASE IF EXISTS ${quoter.quote(database)};`, options);
  }

  /**
   * Describes a table and throws when it lacks a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name.
   * @param options - Query options.
   * @returns The table description (see {@link QueryInterface.describeTable}).
   * @throws Error when the table has no such column.
   * @example
   * ```ts
   * const columns = await queryInterface.assertTableHasColumn('users', 'email');
   * ```
   */
  async assertTableHasColumn(
    table: TableName,
    column: string,
    options: QueryOptionsBase = {},
  ): Promise<Record<string, ColumnDescription>> {
    const description = await this.describeTable(table, options);
    if (description[column] !== undefined) {
      return description;
    }
    throw new Error(
      `Table ${typeof table === 'string' ? table : table.tableName} doesn't have the column ${column}`,
    );
  }

  /**
   * Names of the foreign key constraints of each table.
   *
   * @param tables - Table names or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns Constraint names keyed by table (`schema.table` for qualified tables).
   * @example
   * ```ts
   * const keys = await queryInterface.getForeignKeysForTables(['posts', 'comments']);
   * ```
   */
  async getForeignKeysForTables(
    tables: readonly TableName[],
    options: QueryOptionsBase = {},
  ): Promise<Record<string, readonly string[]>> {
    const entries = await Promise.all(
      tables.map(async (table) => {
        const references = await this.getForeignKeyReferencesForTable(table, options);
        const key = typeof table === 'string' ? table : `${table.schema}.${table.tableName}`;
        return [
          key,
          [...new Set(references.map((reference) => reference.constraintName))],
        ] as const;
      }),
    );
    return Object.fromEntries(entries);
  }
}
