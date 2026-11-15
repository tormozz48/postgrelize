import { DdlGenerator, type ColumnDefinition, type IndexField } from '../ddl/ddl-generator.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { ModelDefinition } from '../model/model-definition.ts';
import { SqlCompiler } from '../sql/compile.ts';

const ddl = new DdlGenerator();

/**
 * Table, column, index and foreign key DDL derived from a model definition for `sync()`.
 *
 * @internal
 */
export class ModelTables {
  /**
   * The definition moved to another schema (the `schema` option of `sync()` / `drop()`).
   *
   * @param definition - Model definition.
   * @param schema - Target schema, or undefined to keep the model's.
   * @returns Definition in the schema.
   */
  inSchema(definition: ModelDefinition, schema: string | undefined): ModelDefinition {
    return schema === undefined ? definition : { ...definition, schema };
  }

  /**
   * Table reference of a definition.
   *
   * @param definition - Model definition.
   * @returns Table name or `{ tableName, schema }`.
   */
  tableOf(definition: ModelDefinition): TableName {
    return definition.schema === undefined
      ? definition.tableName
      : { tableName: definition.tableName, schema: definition.schema };
  }

  /**
   * Columns stored in the table (virtual attributes excluded).
   *
   * @param definition - Model definition.
   * @returns Column definitions.
   */
  storedColumns(definition: ModelDefinition): readonly ColumnDefinition[] {
    return [...definition.attributes.values()]
      .filter((attribute) => attribute.type.isVirtual !== true)
      .map((attribute) => ddl.columnOf(attribute));
  }

  /**
   * `CREATE TABLE` (and enum types) of a definition; deferred columns lose their foreign keys.
   *
   * @param definition - Model definition.
   * @param deferred - Columns created without their foreign keys.
   * @param schema - `schema` option of `sync()`.
   * @returns Statements.
   */
  createStatements(
    definition: ModelDefinition,
    deferred: readonly string[],
    schema: string | undefined,
  ): readonly string[] {
    return ddl.createTableSql(
      this.tableOf(definition),
      this.storedColumns(definition).map((column) =>
        deferred.includes(column.field) ? this.#withoutReferences(column) : column,
      ),
      {
        ...(definition.options.comment === undefined
          ? {}
          : { comment: definition.options.comment }),
        ...(schema === undefined ? {} : { defaultSchema: schema }),
      },
    );
  }

  /**
   * `CREATE INDEX IF NOT EXISTS` of the model indexes, attribute names mapped to fields.
   *
   * @param definition - Model definition.
   * @returns Statements.
   */
  indexStatements(definition: ModelDefinition): readonly string[] {
    const table = this.tableOf(definition);
    return (definition.options.indexes ?? []).map((index) =>
      ddl.createIndexSql(table, {
        ...index,
        ifNotExists: true,
        fields: (index.fields ?? []).map((field) => this.#indexField(definition, field)),
      }),
    );
  }

  /**
   * `ALTER TABLE ... ADD FOREIGN KEY` of a column.
   *
   * @param qualified - Quoted table name.
   * @param column - Column with `references`.
   * @param schema - `schema` option of `sync()`.
   * @returns Statement.
   */
  foreignKeySql(qualified: string, column: ColumnDefinition, schema: string | undefined): string {
    return `ALTER TABLE ${qualified} ADD FOREIGN KEY (${SqlCompiler.quoteIdent(column.field)}) ${ddl.referencesSql(column, schema) ?? ''}`;
  }

  #indexField(definition: ModelDefinition, field: IndexField): IndexField {
    return typeof field === 'string'
      ? (definition.attributes.get(field)?.field ?? field)
      : { ...field, name: definition.attributes.get(field.name)?.field ?? field.name };
  }

  #withoutReferences(column: ColumnDefinition): ColumnDefinition {
    return Object.fromEntries(
      Object.entries(column).filter(([key]) => key !== 'references'),
    ) as ColumnDefinition;
  }
}
