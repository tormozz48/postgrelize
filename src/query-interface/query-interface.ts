import type { DataTypeInput } from '../data-types/data-types.ts';
import {
  DdlGenerator,
  type ColumnDefinition,
  type ConstraintOptions,
  type IndexField,
  type IndexOptions,
} from '../ddl/ddl-generator.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import {
  ModelDefinition,
  type AttributeOptions,
  type ModelAttributes,
} from '../model/model-definition.ts';
import { runtimeKey, type QueryOptionsBase, type RuntimeOwner } from '../model/runtime.ts';
import { SqlAst, type ExprNode } from '../sql/ast.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';

const ast = new SqlAst();

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/** Column description returned by `describeTable` (Sequelize v6 shape). */
export type ColumnDescription = Readonly<{
  /** Upper-case SQL type, e.g. `'CHARACTER VARYING(255)'`. */
  type: string;
  /** Whether `NULL` is allowed. */
  allowNull: boolean;
  /** Default expression without casts and quotes. */
  defaultValue: unknown;
  /** Column comment. */
  comment: string | null;
  /** Enum labels. */
  special: readonly string[];
  /** Part of the primary key. */
  primaryKey: boolean;
}>;

/** Foreign key column of a table. */
export type ForeignKeyReference = Readonly<{
  /** Constraint name. */
  constraintName: string;
  /** Referencing column. */
  columnName: string;
  /** Referenced table. */
  referencedTableName: string;
  /** Referenced column. */
  referencedColumnName: string;
}>;

/** Options of `createTable`. */
export type CreateTableOptions = QueryOptionsBase &
  Readonly<{
    /** Table comment. */
    comment?: string;
  }>;

/** Options of `dropTable`. */
export type DropTableOptions = QueryOptionsBase &
  Readonly<{
    /** `DROP TABLE ... CASCADE`. */
    cascade?: boolean;
  }>;

const identity = new WhereCompiler({ resolve: (name) => ({ field: name }) });

const sqlCompiler = new SqlCompiler();

/**
 * Schema manipulation API (Sequelize v6 `QueryInterface`) for PostgreSQL. Used by `sync()` and by
 * migrations (`sequelize-cli`, umzug).
 */
export class QueryInterface {
  /** Owning `Sequelize` instance. */
  readonly sequelize: RuntimeOwner;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    this.sequelize = sequelize;
  }

  async #run(
    sql: string,
    options: QueryOptionsBase = {},
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const result = await this.sequelize[runtimeKey].execute({ text: sql, values: [] }, options);
    return result.rows;
  }

  async #runAll(statements: readonly string[], options: QueryOptionsBase = {}): Promise<void> {
    await statements.reduce<Promise<unknown>>(
      (previous, sql) => previous.then(() => this.#run(sql, options)),
      Promise.resolve(),
    );
  }

  #parseArray(value: unknown): readonly string[] {
    return Array.isArray(value)
      ? value.map(String)
      : typeof value === 'string' && value.startsWith('{')
        ? value
            .slice(1, -1)
            .split(',')
            .filter((item) => item !== '')
            .map((item) => item.replace(/^"(.*)"$/, '$1'))
        : [];
  }

  #cleanDefault(type: string, value: unknown): unknown {
    if (type === 'BOOLEAN') {
      return value === 'true' ? true : value === 'false' ? false : null;
    }
    if (typeof value !== 'string') {
      return value;
    }
    const literal = /^'((?:[^']|'')*)'(?:::[\w ."[\]]+)*$/.exec(value);
    if (literal !== null) {
      return (literal[1] ?? '').replaceAll("''", "'");
    }
    const unquoted = value.replaceAll("'", '');
    const [head, tail] = unquoted.split('::');
    return tail !== undefined && tail.toLowerCase() !== 'regclass)' ? head : unquoted;
  }

  #normalizeColumn(name: string, attribute: DataTypeInput | AttributeOptions): ColumnDefinition {
    return ddl.columnOf(ModelDefinition.attribute(name, attribute, false));
  }

  /**
   * Creates a schema if it does not exist.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#run(`CREATE SCHEMA IF NOT EXISTS ${SqlCompiler.quoteIdent(schema)}`, options);
  }

  /**
   * Drops a schema with everything in it.
   *
   * @param schema - Schema name.
   * @param options - Query options.
   */
  async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
    await this.#run(`DROP SCHEMA IF EXISTS ${SqlCompiler.quoteIdent(schema)} CASCADE`, options);
  }

  /**
   * Lists user schemas.
   *
   * @param options - Query options.
   * @returns Schema names.
   */
  async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
    const rows = await this.#run(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name <> 'public' AND schema_name !~ E'^pg_' ORDER BY schema_name",
      options,
    );
    return rows.map((row) => String(row['schema_name']));
  }

  /**
   * Drops every user schema listed by {@link QueryInterface.showAllSchemas} with everything in it.
   *
   * @param options - Query options.
   */
  async dropAllSchemas(options?: QueryOptionsBase): Promise<void> {
    const schemas = await this.showAllSchemas(options);
    await Promise.all(schemas.map((schema) => this.dropSchema(schema, options)));
  }

  /**
   * Creates a table (and its enum types) if it does not exist.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param attributes - Column definitions keyed by column name.
   * @param options - Comment and query options.
   */
  async createTable(
    table: TableName,
    attributes: ModelAttributes,
    options: CreateTableOptions = {},
  ): Promise<void> {
    const columns = Object.entries(attributes).map(([name, attribute]) =>
      this.#normalizeColumn(name, attribute),
    );
    await this.#runAll(
      ddl.createTableSql(
        table,
        columns,
        options.comment === undefined ? {} : { comment: options.comment },
      ),
      options,
    );
  }

  /**
   * Drops a table if it exists.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `cascade` and query options.
   */
  async dropTable(table: TableName, options: DropTableOptions = {}): Promise<void> {
    await this.#run(
      `DROP TABLE IF EXISTS ${sqlLiteral.quoteTable(table)}${options.cascade === true ? ' CASCADE' : ''}`,
      options,
    );
  }

  /**
   * Drops all tables of the current schema.
   *
   * @param options - `skip`: table names to keep.
   */
  async dropAllTables(
    options: QueryOptionsBase & Readonly<{ skip?: readonly string[] }> = {},
  ): Promise<void> {
    const tables = (await this.showAllTables(options)).filter(
      (name) => !(options.skip ?? []).includes(name),
    );
    await this.#runAll(
      tables.map((name) => `DROP TABLE IF EXISTS ${SqlCompiler.quoteIdent(name)} CASCADE`),
      options,
    );
  }

  /**
   * Renames a table.
   *
   * @param before - Current table.
   * @param after - New table name.
   * @param options - Query options.
   */
  async renameTable(
    before: TableName,
    after: TableName,
    options?: QueryOptionsBase,
  ): Promise<void> {
    await this.#run(
      `ALTER TABLE ${sqlLiteral.quoteTable(before)} RENAME TO ${SqlCompiler.quoteIdent(sqlLiteral.tableParts(after).name)}`,
      options,
    );
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
    const rows = await this.#run(
      `SELECT 1 FROM information_schema.tables WHERE table_name = ${sqlLiteral.escape(name)} AND table_schema = ${schema === undefined ? 'current_schema()' : sqlLiteral.escape(schema)}`,
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
    const rows = await this.#run(
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
    options: QueryOptionsBase & Readonly<{ schema?: string }> = {},
  ): Promise<Record<string, ColumnDescription>> {
    const { name, schema } = sqlLiteral.tableParts(table, options.schema);
    const schemaSql = schema === undefined ? 'current_schema()' : sqlLiteral.escape(schema);
    const rows = await this.#run(
      `SELECT pk.constraint_type AS "Constraint", c.column_name AS "Field", c.column_default AS "Default", c.is_nullable AS "Null", (CASE WHEN c.udt_name = 'hstore' THEN c.udt_name ELSE c.data_type END) || (CASE WHEN c.character_maximum_length IS NOT NULL THEN '(' || c.character_maximum_length || ')' ELSE '' END) AS "Type", (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid WHERE t.typname = c.udt_name AND tn.nspname = c.udt_schema) AS "special", (SELECT pgd.description FROM pg_catalog.pg_statio_all_tables AS st INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid) WHERE c.ordinal_position = pgd.objsubid AND c.table_name = st.relname AND st.schemaname = c.table_schema) AS "Comment" FROM information_schema.columns c LEFT JOIN (SELECT tc.table_schema, tc.table_name, cu.column_name, tc.constraint_type FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage cu ON tc.table_schema = cu.table_schema AND tc.table_name = cu.table_name AND tc.constraint_name = cu.constraint_name AND tc.constraint_type = 'PRIMARY KEY') pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name WHERE c.table_name = ${sqlLiteral.escape(name)} AND c.table_schema = ${schemaSql} ORDER BY c.ordinal_position`,
      options,
    );
    if (rows.length === 0) {
      throw new Error(
        `No description found for table ${name}. Check the table name and schema; remember, they _are_ case sensitive.`,
      );
    }
    return Object.fromEntries(
      rows.map((row) => {
        const type = String(row['Type']).toUpperCase();
        return [
          String(row['Field']),
          {
            type,
            allowNull: row['Null'] === 'YES',
            defaultValue: this.#cleanDefault(type, row['Default']),
            comment: (row['Comment'] as string | null) ?? null,
            special: this.#parseArray(row['special']),
            primaryKey: row['Constraint'] === 'PRIMARY KEY',
          },
        ];
      }),
    );
  }

  /**
   * Adds a column.
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
    const definition = this.#normalizeColumn(column, attribute);
    const enumSql = ddl.createEnumSql(table, definition);
    await this.#runAll(
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
    await this.#run(
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
    await this.#runAll(
      ddl.changeColumnSql(table, this.#normalizeColumn(column, attribute)),
      options,
    );
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
    await this.#run(
      `ALTER TABLE ${sqlLiteral.quoteTable(table)} RENAME COLUMN ${SqlCompiler.quoteIdent(before)} TO ${SqlCompiler.quoteIdent(after)}`,
      options,
    );
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
    options: IndexOptions & QueryOptionsBase = {},
  ): Promise<void> {
    const index: IndexOptions = Array.isArray(fieldsOrOptions)
      ? { ...options, fields: fieldsOrOptions as readonly IndexField[] }
      : { ...(fieldsOrOptions as IndexOptions), ...options };
    await this.#run(ddl.createIndexSql(table, index), options);
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
    options: QueryOptionsBase & Readonly<{ concurrently?: boolean }> = {},
  ): Promise<void> {
    const { schema } = sqlLiteral.tableParts(table);
    const name =
      typeof nameOrFields === 'string' ? nameOrFields : ddl.indexName(table, nameOrFields);
    const qualified =
      schema === undefined
        ? SqlCompiler.quoteIdent(name)
        : `${SqlCompiler.quoteIdent(schema)}.${SqlCompiler.quoteIdent(name)}`;
    await this.#run(
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
    await this.#run(ddl.addConstraintSql(table, options), options);
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
    await this.#run(
      `ALTER TABLE ${sqlLiteral.quoteTable(table)} DROP CONSTRAINT ${SqlCompiler.quoteIdent(name)}`,
      options,
    );
  }

  /**
   * Drops an enum type.
   *
   * @param name - Enum type name.
   * @param options - Query options.
   */
  async dropEnum(name: string, options?: QueryOptionsBase): Promise<void> {
    await this.#run(`DROP TYPE IF EXISTS ${SqlCompiler.quoteIdent(name)}`, options);
  }

  /**
   * Drops all enum types of the current schema.
   *
   * @param options - Query options.
   */
  async dropAllEnums(options?: QueryOptionsBase): Promise<void> {
    const rows = await this.#run(
      "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = current_schema()",
      options,
    );
    await this.#runAll(
      rows.map(
        (row) => `DROP TYPE IF EXISTS ${SqlCompiler.quoteIdent(String(row['typname']))} CASCADE`,
      ),
      options,
    );
  }

  /** @internal */
  async dropEnumsOf(
    table: TableName,
    fields: readonly string[],
    options?: QueryOptionsBase,
  ): Promise<void> {
    const { schema } = sqlLiteral.tableParts(table);
    await this.#runAll(
      fields.map((field) => {
        const name = SqlCompiler.quoteIdent(ddl.enumTypeName(table, field));
        return `DROP TYPE IF EXISTS ${schema === undefined ? name : `${SqlCompiler.quoteIdent(schema)}.${name}`}`;
      }),
      options,
    );
  }

  /**
   * Inserts rows (used by seeders). Values are bound as parameters.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param records - Rows keyed by column name.
   * @param options - Query options.
   * @returns Number of inserted rows.
   */
  async bulkInsert(
    table: TableName,
    records: readonly Readonly<Record<string, unknown>>[],
    options: QueryOptionsBase = {},
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }
    const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const { name, schema } = sqlLiteral.tableParts(table);
    const result = await this.sequelize[runtimeKey].execute(
      sqlCompiler.compile({
        kind: 'insert',
        table: { name, ...(schema === undefined ? {} : { schema }) },
        columns,
        rows: records.map((record) =>
          columns.map((column): ExprNode =>
            record[column] === undefined ? ast.raw('DEFAULT') : identity.toExpr(record[column]),
          ),
        ),
      }),
      options,
    );
    return result.rowCount;
  }

  /**
   * Updates rows matching `where`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param values - New column values.
   * @param where - Filter (where object keyed by column).
   * @param options - Query options.
   * @returns Number of updated rows.
   */
  async bulkUpdate(
    table: TableName,
    values: Readonly<Record<string, unknown>>,
    where: unknown,
    options: QueryOptionsBase = {},
  ): Promise<number> {
    const { name, schema } = sqlLiteral.tableParts(table);
    const result = await this.sequelize[runtimeKey].execute(
      sqlCompiler.compile({
        kind: 'update',
        table: { name, ...(schema === undefined ? {} : { schema }) },
        set: Object.entries(values).map(([column, value]) => ({
          column,
          value: identity.toExpr(value),
        })),
        ...(WhereCompiler.isEmpty(where) ? {} : { where: identity.compile(where) }),
      }),
      options,
    );
    return result.rowCount;
  }

  /**
   * Deletes rows matching `where`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param where - Filter (where object keyed by column); empty deletes all rows.
   * @param options - Query options.
   * @returns Number of deleted rows.
   */
  async bulkDelete(
    table: TableName,
    where: unknown = {},
    options: QueryOptionsBase = {},
  ): Promise<number> {
    const { name, schema } = sqlLiteral.tableParts(table);
    const result = await this.sequelize[runtimeKey].execute(
      sqlCompiler.compile({
        kind: 'delete',
        table: { name, ...(schema === undefined ? {} : { schema }) },
        ...(WhereCompiler.isEmpty(where) ? {} : { where: identity.compile(where) }),
      }),
      options,
    );
    return result.rowCount;
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
    const rows = await this.#run(
      `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS referenced_table_name, ccu.column_name AS referenced_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = ${sqlLiteral.escape(name)} AND tc.table_schema = ${schema === undefined ? 'current_schema()' : sqlLiteral.escape(schema)}`,
      options,
    );
    return rows.map((row) => ({
      constraintName: String(row['constraint_name']),
      columnName: String(row['column_name']),
      referencedTableName: String(row['referenced_table_name']),
      referencedColumnName: String(row['referenced_column_name']),
    }));
  }
}
