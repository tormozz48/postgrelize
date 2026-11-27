import { DdlGenerator, type ColumnDefinition } from '../ddl/ddl-generator.ts';
import { Deferrable } from '../ddl/ddl-types.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { ModelDefinition } from '../model/model-definition.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { SqlCompiler } from '../sql/compile.ts';
import type { ModelTables } from './model-tables.ts';
import type { QueryInterface } from './query-interface.ts';
import type { ColumnDescription, ForeignKeyReference } from './query-interface-types.ts';

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/** Existing table and model columns compared by `alter`. */
type AlterTarget = Readonly<{
  table: TableName;
  qualified: string;
  columns: readonly ColumnDefinition[];
  described: Readonly<Record<string, ColumnDescription>>;
}>;

/**
 * Diffs a model against its existing table for `sync({ alter })`: added, changed, referencing and
 * dropped columns, in that order.
 *
 * @internal
 */
export class AlterPlanner {
  readonly #queryInterface: QueryInterface;
  readonly #tables: ModelTables;

  /**
   * @param queryInterface - Query interface used to inspect the table.
   * @param tables - Model table DDL.
   */
  constructor(queryInterface: QueryInterface, tables: ModelTables) {
    this.#queryInterface = queryInterface;
    this.#tables = tables;
  }

  /**
   * Statements that bring the existing table in line with the model.
   *
   * @param definition - Model definition.
   * @param alter - `alter` option; `{ drop: false }` keeps extra columns.
   * @param options - `schema` and query options.
   * @returns Statements.
   */
  async statements(
    definition: ModelDefinition,
    alter: boolean | Readonly<{ drop?: boolean }>,
    options: QueryOptionsBase & Readonly<{ schema?: string }>,
  ): Promise<readonly string[]> {
    const table = this.#tables.tableOf(definition);
    const qualified = sqlLiteral.quoteTable(table);
    const described = await this.#queryInterface.describeTable(table, options);
    const columns = this.#tables.storedColumns(definition);
    const foreignKeys = await this.#queryInterface.getForeignKeyReferencesForTable(table, options);
    const target: AlterTarget = { table, qualified, columns, described };
    return [
      ...this.#added(target),
      ...this.#changed(target),
      ...this.#references(target, foreignKeys, options.schema),
      ...this.#dropped(target, alter),
    ];
  }

  /**
   * Columns of the table that already have a foreign key.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns Column names.
   */
  async foreignKeyColumns(
    table: TableName,
    options: QueryOptionsBase,
  ): Promise<ReadonlySet<string>> {
    const references = await this.#queryInterface.getForeignKeyReferencesForTable(table, options);
    return new Set(references.map((reference) => reference.columnName));
  }

  #added({ table, qualified, columns, described }: AlterTarget): readonly string[] {
    return columns
      .filter((column) => described[column.field] === undefined)
      .flatMap((column) => {
        const enumSql = ddl.createEnumSql(table, column);
        return [
          ...(enumSql === undefined ? [] : [enumSql]),
          `ALTER TABLE ${qualified} ADD COLUMN ${ddl.columnSql(table, column)}`,
          ...ddl.columnCommentSql(table, column),
        ];
      });
  }

  #changed({ table, columns, described }: AlterTarget): readonly string[] {
    return columns
      .filter(
        (column) =>
          described[column.field] !== undefined &&
          !column.primaryKey &&
          column.generated === undefined &&
          column.identity === undefined,
      )
      .flatMap((column) => {
        // foreign keys of altered columns are reconciled separately
        const { references: _added, ...altered } = column;
        return [
          ...ddl.addEnumValuesSql(table, column),
          ...ddl.changeColumnSql(table, altered as typeof column),
        ];
      });
  }

  // missing foreign keys are added; like v6, one whose deferrable mode changed is re-created
  #references(
    { qualified, columns, described }: AlterTarget,
    foreignKeys: readonly ForeignKeyReference[],
    schema: string | undefined,
  ): readonly string[] {
    return columns
      .filter((column) => described[column.field] !== undefined && column.references !== undefined)
      .flatMap((column) => this.#reference(qualified, column, foreignKeys, schema));
  }

  #reference(
    qualified: string,
    column: ColumnDefinition,
    foreignKeys: readonly ForeignKeyReference[],
    schema: string | undefined,
  ): readonly string[] {
    const existing = foreignKeys.filter((key) => key.columnName === column.field);
    const stale = existing.filter((key) => this.#deferrableChanged(column, key));
    if (existing.length > 0 && stale.length === 0) {
      return [];
    }
    const dropped = stale.map(
      (key) =>
        `ALTER TABLE ${qualified} DROP CONSTRAINT ${SqlCompiler.quoteIdent(key.constraintName)}`,
    );
    return [...dropped, this.#tables.foreignKeySql(qualified, column, schema)];
  }

  #deferrableChanged(column: ColumnDefinition, key: ForeignKeyReference): boolean {
    const references = column.references as Readonly<{
      key?: string;
      deferrable?: Readonly<{ sql: string }>;
    }>;
    return (
      key.referencedColumnName === (references.key ?? 'id') &&
      key.deferrable.sql !== (references.deferrable ?? Deferrable.NOT).sql
    );
  }

  #dropped(
    { qualified, columns, described }: AlterTarget,
    alter: boolean | Readonly<{ drop?: boolean }>,
  ): readonly string[] {
    if (typeof alter === 'object' && alter.drop === false) {
      return [];
    }
    const fields = new Set(columns.map((column) => column.field));
    return Object.keys(described)
      .filter((field) => !fields.has(field))
      .map((field) => `ALTER TABLE ${qualified} DROP COLUMN ${SqlCompiler.quoteIdent(field)}`);
  }
}
