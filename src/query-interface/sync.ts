import {
  addEnumValuesSql,
  changeColumnSql,
  columnCommentSql,
  columnOf,
  columnSql,
  createEnumSql,
  createIndexSql,
  createTableSql,
  referencesSql,
} from '../ddl/ddl.ts';
import { quoteTable, type TableName } from '../ddl/literals.ts';
import type { AttributeDefinition, ModelDefinition } from '../model/definition.ts';
import type { ModelRuntime, QueryOptionsBase } from '../model/runtime.ts';
import { quoteIdent } from '../sql/compile.ts';
import type { QueryInterface } from './query-interface.ts';

/** `alter` options of `sync()`. */
export type AlterOptions = Readonly<{
  /** Drop columns that are not in the model. Default true. */
  drop?: boolean;
}>;

/** Options of `sync()`. */
export type SyncOptions = QueryOptionsBase &
  Readonly<{
    /** Drop and re-create tables. */
    force?: boolean;
    /** Alter existing tables to match models; `{ drop: false }` keeps extra columns. */
    alter?: boolean | AlterOptions;
    /** Only sync when the database name matches this pattern. */
    match?: RegExp;
    /** Create the tables in this schema instead of the models' schema (references stay in it too). */
    schema?: string;
  }>;

type ColumnDefinition = ReturnType<typeof columnOf>;

const withoutReferences = (column: ColumnDefinition): ColumnDefinition =>
  Object.fromEntries(
    Object.entries(column).filter(([key]) => key !== 'references'),
  ) as ColumnDefinition;

/** Options of `drop()`. */
export type DropOptions = QueryOptionsBase &
  Readonly<{
    /** `DROP TABLE ... CASCADE`. */
    cascade?: boolean;
    /** Drop the tables in this schema instead of the models' schema. */
    schema?: string;
  }>;

const inSchema = (definition: ModelDefinition, schema: string | undefined): ModelDefinition =>
  schema === undefined ? definition : { ...definition, schema };

const tableOf = (definition: ModelDefinition): TableName =>
  definition.schema === undefined
    ? definition.tableName
    : { tableName: definition.tableName, schema: definition.schema };

const storedColumns = (definition: ModelDefinition) =>
  [...definition.attributes.values()]
    .filter((attribute) => attribute.type.isVirtual !== true)
    .map(columnOf);

const run = async (
  runtime: ModelRuntime,
  statements: readonly string[],
  options: QueryOptionsBase,
): Promise<void> => {
  await statements.reduce<Promise<unknown>>(
    (previous, text) => previous.then(() => runtime.execute({ text, values: [] }, options)),
    Promise.resolve(),
  );
};

const alterStatements = async (
  definition: ModelDefinition,
  queryInterface: QueryInterface,
  alter: boolean | Readonly<{ drop?: boolean }>,
  options: QueryOptionsBase & Readonly<{ schema?: string }>,
): Promise<readonly string[]> => {
  const { schema } = options;
  const table = tableOf(definition);
  const qualified = quoteTable(table);
  const described = await queryInterface.describeTable(table, options);
  const columns = storedColumns(definition);
  const foreignKeys = new Set(
    (await queryInterface.getForeignKeyReferencesForTable(table, options)).map(
      (reference) => reference.columnName,
    ),
  );
  const fields = new Set(columns.map((column) => column.field));
  const added = columns
    .filter((column) => described[column.field] === undefined)
    .flatMap((column) => {
      const enumSql = createEnumSql(table, column);
      return [
        ...(enumSql === undefined ? [] : [enumSql]),
        `ALTER TABLE ${qualified} ADD COLUMN ${columnSql(table, column)}`,
        ...columnCommentSql(table, column),
      ];
    });
  const changed = columns
    .filter(
      (column) =>
        described[column.field] !== undefined &&
        !column.primaryKey &&
        column.generated === undefined &&
        column.identity === undefined,
    )
    .flatMap((column) => [...addEnumValuesSql(table, column), ...changeColumnSql(table, column)]);
  const references = columns
    .filter(
      (column) =>
        described[column.field] !== undefined &&
        column.references !== undefined &&
        !foreignKeys.has(column.field),
    )
    .map(
      (column) =>
        `ALTER TABLE ${qualified} ADD FOREIGN KEY (${quoteIdent(column.field)}) ${referencesSql(column, schema) ?? ''}`,
    );
  const dropped =
    typeof alter === 'object' && alter.drop === false
      ? []
      : Object.keys(described)
          .filter((field) => !fields.has(field))
          .map((field) => `ALTER TABLE ${qualified} DROP COLUMN ${quoteIdent(field)}`);
  return [...added, ...changed, ...references, ...dropped];
};

/** Creates (or alters / re-creates) the table of a model and its indexes. */
export const syncModel = async (
  model: ModelDefinition,
  runtime: ModelRuntime,
  queryInterface: QueryInterface,
  options: SyncOptions = {},
  deferred: readonly string[] = [],
): Promise<void> => {
  const definition = inSchema(model, options.schema);
  const table = tableOf(definition);
  if (options.force === true) {
    await dropModel(definition, queryInterface, { ...options, cascade: true });
  }
  const exists = options.force !== true && (await queryInterface.tableExists(table, options));
  const statements =
    exists && options.alter !== undefined && options.alter !== false
      ? await alterStatements(definition, queryInterface, options.alter, options)
      : exists
        ? []
        : createTableSql(
            table,
            storedColumns(definition).map((column) =>
              deferred.includes(column.field) ? withoutReferences(column) : column,
            ),
            {
              ...(definition.options.comment === undefined
                ? {}
                : { comment: definition.options.comment }),
              ...(options.schema === undefined ? {} : { defaultSchema: options.schema }),
            },
          );
  const indexes = (definition.options.indexes ?? []).map((index) =>
    createIndexSql(table, {
      ...index,
      ifNotExists: true,
      fields: (index.fields ?? []).map((field) =>
        typeof field === 'string'
          ? (definition.attributes.get(field)?.field ?? field)
          : { ...field, name: definition.attributes.get(field.name)?.field ?? field.name },
      ),
    }),
  );
  await run(runtime, [...statements, ...indexes], options);
};

/** Drops the table of a model and its enum types. */
export const dropModel = async (
  model: ModelDefinition,
  queryInterface: QueryInterface,
  options: DropOptions = {},
): Promise<void> => {
  const definition = inSchema(model, options.schema);
  const table = tableOf(definition);
  await queryInterface.dropTable(table, options);
  const enumFields = [...definition.attributes.values()]
    .filter((attribute) => attribute.type.key === 'ENUM' || attribute.type.subtype?.key === 'ENUM')
    .map((attribute) => attribute.field);
  await queryInterface.dropEnumsOf(table, enumFields, options);
};

const referencedTable = (references: AttributeDefinition['references']): string | undefined =>
  references === undefined
    ? undefined
    : typeof references === 'string'
      ? references
      : typeof references.model === 'string'
        ? references.model
        : references.model.tableName;

const referencedTables = (definition: ModelDefinition): readonly string[] =>
  [...definition.attributes.values()].flatMap((attribute) => {
    const table = referencedTable(attribute.references);
    return table === undefined ? [] : [table];
  });

/**
 * Columns (by field) of each definition whose foreign key points to a table created later in
 * `ordered` — a reference cycle. Their tables are created without these constraints, which are
 * added once every table exists.
 */
export const deferredReferences = (
  ordered: readonly ModelDefinition[],
): ReadonlyMap<ModelDefinition, readonly string[]> => {
  const position = new Map(ordered.map((definition, index) => [definition.tableName, index]));
  return new Map(
    ordered.map((definition, index) => [
      definition,
      [...definition.attributes.values()]
        .filter((attribute) => {
          const target = position.get(referencedTable(attribute.references) ?? '');
          return target !== undefined && target > index;
        })
        .map((attribute) => attribute.field),
    ]),
  );
};

/** Adds the deferred foreign keys of a table that are not there yet. */
export const addDeferredReferences = async (
  model: ModelDefinition,
  fields: readonly string[],
  runtime: ModelRuntime,
  queryInterface: QueryInterface,
  options: QueryOptionsBase & Readonly<{ schema?: string }>,
): Promise<void> => {
  if (fields.length === 0) {
    return;
  }
  const { schema } = options;
  const definition = inSchema(model, schema);
  const table = tableOf(definition);
  const existing = new Set(
    (await queryInterface.getForeignKeyReferencesForTable(table, options)).map(
      (reference) => reference.columnName,
    ),
  );
  await run(
    runtime,
    storedColumns(definition)
      .filter((column) => fields.includes(column.field) && !existing.has(column.field))
      .map(
        (column) =>
          `ALTER TABLE ${quoteTable(table)} ADD FOREIGN KEY (${quoteIdent(column.field)}) ${referencesSql(column, schema) ?? ''}`,
      ),
    options,
  );
};

/** Orders definitions so that referenced tables come first. */
export const dependencyOrder = (
  definitions: readonly ModelDefinition[],
): readonly ModelDefinition[] => {
  const byTable = new Map(definitions.map((definition) => [definition.tableName, definition]));
  const visit = (
    definition: ModelDefinition,
    seen: ReadonlySet<string>,
    ordered: readonly ModelDefinition[],
  ): readonly ModelDefinition[] => {
    if (ordered.includes(definition) || seen.has(definition.tableName)) {
      return ordered;
    }
    const nextSeen = new Set([...seen, definition.tableName]);
    const withDependencies = referencedTables(definition)
      .map((table) => byTable.get(table))
      .filter(
        (dependency): dependency is ModelDefinition =>
          dependency !== undefined && dependency !== definition,
      )
      .reduce((acc, dependency) => visit(dependency, nextSeen, acc), ordered);
    return withDependencies.includes(definition)
      ? withDependencies
      : [...withDependencies, definition];
  };
  return definitions.reduce<readonly ModelDefinition[]>(
    (ordered, definition) => visit(definition, new Set(), ordered),
    [],
  );
};
