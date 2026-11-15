import { DdlGenerator, type ColumnDefinition } from '../ddl/ddl-generator.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { AttributeDefinition, ModelDefinition } from '../model/definition.ts';
import type { ModelRuntime, QueryOptionsBase } from '../model/runtime.ts';
import { SqlCompiler } from '../sql/compile.ts';
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

/** Options of `drop()`. */
export type DropOptions = QueryOptionsBase &
  Readonly<{
    /** `DROP TABLE ... CASCADE`. */
    cascade?: boolean;
    /** Drop the tables in this schema instead of the models' schema. */
    schema?: string;
  }>;

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

/**
 * Creates, alters and drops the tables of model definitions (`sync()` / `drop()`): dependency
 * order, deferred foreign keys for reference cycles, `force`, `alter` and the `schema` option.
 *
 * @internal
 */
export class SchemaSynchronizer {
  readonly #runtime: ModelRuntime;
  readonly #queryInterface: QueryInterface;

  /**
   * @param runtime - Runtime executing the statements.
   * @param queryInterface - Query interface used to inspect and drop tables.
   */
  constructor(runtime: ModelRuntime, queryInterface: QueryInterface) {
    this.#runtime = runtime;
    this.#queryInterface = queryInterface;
  }

  /**
   * Syncs several models: referenced tables first, foreign keys of reference cycles added once
   * every table exists. With `force`, drops the tables in reverse order first.
   *
   * @param definitions - Model definitions.
   * @param options - `force`, `alter`, `schema` and query options.
   */
  async syncAll(definitions: readonly ModelDefinition[], options: SyncOptions = {}): Promise<void> {
    const ordered = this.#dependencyOrder(definitions);
    if (options.force === true) {
      await ordered
        .toReversed()
        .reduce<Promise<unknown>>(
          (previous, definition) =>
            previous.then(() => this.drop(definition, { ...options, cascade: true })),
          Promise.resolve(),
        );
    }
    const deferred = this.#deferredReferences(ordered);
    await ordered.reduce<Promise<unknown>>(
      (previous, definition) =>
        previous.then(() =>
          this.sync(definition, { ...options, force: false }, deferred.get(definition)),
        ),
      Promise.resolve(),
    );
    await ordered.reduce<Promise<unknown>>(
      (previous, definition) =>
        previous.then(() =>
          this.#addDeferredReferences(definition, deferred.get(definition) ?? [], options),
        ),
      Promise.resolve(),
    );
  }

  /**
   * Drops the tables of several models in reverse foreign-key order.
   *
   * @param definitions - Model definitions.
   * @param options - `cascade`, `schema` and query options.
   */
  async dropAll(definitions: readonly ModelDefinition[], options: DropOptions = {}): Promise<void> {
    await this.#dependencyOrder(definitions)
      .toReversed()
      .reduce<Promise<unknown>>(
        (previous, definition) => previous.then(() => this.drop(definition, options)),
        Promise.resolve(),
      );
  }

  /**
   * Creates (or alters / re-creates) the table of a model and its indexes.
   *
   * @param model - Model definition.
   * @param options - `force`, `alter`, `schema` and query options.
   * @param deferred - Columns created without their foreign keys (added later).
   */
  async sync(
    model: ModelDefinition,
    options: SyncOptions = {},
    deferred: readonly string[] = [],
  ): Promise<void> {
    const definition = this.#inSchema(model, options.schema);
    const table = this.#tableOf(definition);
    if (options.force === true) {
      await this.drop(definition, { ...options, cascade: true });
    }
    const exists =
      options.force !== true && (await this.#queryInterface.tableExists(table, options));
    const statements =
      exists && options.alter !== undefined && options.alter !== false
        ? await this.#alterStatements(definition, options.alter, options)
        : exists
          ? []
          : ddl.createTableSql(
              table,
              this.#storedColumns(definition).map((column) =>
                deferred.includes(column.field) ? this.#withoutReferences(column) : column,
              ),
              {
                ...(definition.options.comment === undefined
                  ? {}
                  : { comment: definition.options.comment }),
                ...(options.schema === undefined ? {} : { defaultSchema: options.schema }),
              },
            );
    const indexes = (definition.options.indexes ?? []).map((index) =>
      ddl.createIndexSql(table, {
        ...index,
        ifNotExists: true,
        fields: (index.fields ?? []).map((field) =>
          typeof field === 'string'
            ? (definition.attributes.get(field)?.field ?? field)
            : { ...field, name: definition.attributes.get(field.name)?.field ?? field.name },
        ),
      }),
    );
    await this.#run([...statements, ...indexes], options);
  }

  /**
   * Drops the table of a model and its enum types.
   *
   * @param model - Model definition.
   * @param options - `cascade`, `schema` and query options.
   */
  async drop(model: ModelDefinition, options: DropOptions = {}): Promise<void> {
    const definition = this.#inSchema(model, options.schema);
    const table = this.#tableOf(definition);
    await this.#queryInterface.dropTable(table, options);
    const enumFields = [...definition.attributes.values()]
      .filter(
        (attribute) => attribute.type.key === 'ENUM' || attribute.type.subtype?.key === 'ENUM',
      )
      .map((attribute) => attribute.field);
    await this.#queryInterface.dropEnumsOf(table, enumFields, options);
  }

  #withoutReferences(column: ColumnDefinition): ColumnDefinition {
    return Object.fromEntries(
      Object.entries(column).filter(([key]) => key !== 'references'),
    ) as ColumnDefinition;
  }

  #inSchema(definition: ModelDefinition, schema: string | undefined): ModelDefinition {
    return schema === undefined ? definition : { ...definition, schema };
  }

  #tableOf(definition: ModelDefinition): TableName {
    return definition.schema === undefined
      ? definition.tableName
      : { tableName: definition.tableName, schema: definition.schema };
  }

  #storedColumns(definition: ModelDefinition): readonly ColumnDefinition[] {
    return [...definition.attributes.values()]
      .filter((attribute) => attribute.type.isVirtual !== true)
      .map((attribute) => ddl.columnOf(attribute));
  }

  async #run(statements: readonly string[], options: QueryOptionsBase): Promise<void> {
    await statements.reduce<Promise<unknown>>(
      (previous, text) => previous.then(() => this.#runtime.execute({ text, values: [] }, options)),
      Promise.resolve(),
    );
  }

  async #alterStatements(
    definition: ModelDefinition,
    alter: boolean | Readonly<{ drop?: boolean }>,
    options: QueryOptionsBase & Readonly<{ schema?: string }>,
  ): Promise<readonly string[]> {
    const { schema } = options;
    const table = this.#tableOf(definition);
    const qualified = sqlLiteral.quoteTable(table);
    const described = await this.#queryInterface.describeTable(table, options);
    const columns = this.#storedColumns(definition);
    const foreignKeys = new Set(
      (await this.#queryInterface.getForeignKeyReferencesForTable(table, options)).map(
        (reference) => reference.columnName,
      ),
    );
    const fields = new Set(columns.map((column) => column.field));
    const added = columns
      .filter((column) => described[column.field] === undefined)
      .flatMap((column) => {
        const enumSql = ddl.createEnumSql(table, column);
        return [
          ...(enumSql === undefined ? [] : [enumSql]),
          `ALTER TABLE ${qualified} ADD COLUMN ${ddl.columnSql(table, column)}`,
          ...ddl.columnCommentSql(table, column),
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
      .flatMap((column) => [
        ...ddl.addEnumValuesSql(table, column),
        ...ddl.changeColumnSql(table, column),
      ]);
    const references = columns
      .filter(
        (column) =>
          described[column.field] !== undefined &&
          column.references !== undefined &&
          !foreignKeys.has(column.field),
      )
      .map(
        (column) =>
          `ALTER TABLE ${qualified} ADD FOREIGN KEY (${SqlCompiler.quoteIdent(column.field)}) ${ddl.referencesSql(column, schema) ?? ''}`,
      );
    const dropped =
      typeof alter === 'object' && alter.drop === false
        ? []
        : Object.keys(described)
            .filter((field) => !fields.has(field))
            .map(
              (field) => `ALTER TABLE ${qualified} DROP COLUMN ${SqlCompiler.quoteIdent(field)}`,
            );
    return [...added, ...changed, ...references, ...dropped];
  }

  #referencedTable(references: AttributeDefinition['references']): string | undefined {
    return references === undefined
      ? undefined
      : typeof references === 'string'
        ? references
        : typeof references.model === 'string'
          ? references.model
          : references.model.tableName;
  }

  #referencedTables(definition: ModelDefinition): readonly string[] {
    return [...definition.attributes.values()].flatMap((attribute) => {
      const table = this.#referencedTable(attribute.references);
      return table === undefined ? [] : [table];
    });
  }

  /**
   * Columns (by field) of each definition whose foreign key points to a table created later in
   * `ordered` — a reference cycle. Their tables are created without these constraints, which are
   * added once every table exists.
   */
  #deferredReferences(
    ordered: readonly ModelDefinition[],
  ): ReadonlyMap<ModelDefinition, readonly string[]> {
    const position = new Map(ordered.map((definition, index) => [definition.tableName, index]));
    return new Map(
      ordered.map((definition, index) => [
        definition,
        [...definition.attributes.values()]
          .filter((attribute) => {
            const target = position.get(this.#referencedTable(attribute.references) ?? '');
            return target !== undefined && target > index;
          })
          .map((attribute) => attribute.field),
      ]),
    );
  }

  /** Adds the deferred foreign keys of a table that are not there yet. */
  async #addDeferredReferences(
    model: ModelDefinition,
    fields: readonly string[],
    options: QueryOptionsBase & Readonly<{ schema?: string }>,
  ): Promise<void> {
    if (fields.length === 0) {
      return;
    }
    const { schema } = options;
    const definition = this.#inSchema(model, schema);
    const table = this.#tableOf(definition);
    const existing = new Set(
      (await this.#queryInterface.getForeignKeyReferencesForTable(table, options)).map(
        (reference) => reference.columnName,
      ),
    );
    await this.#run(
      this.#storedColumns(definition)
        .filter((column) => fields.includes(column.field) && !existing.has(column.field))
        .map(
          (column) =>
            `ALTER TABLE ${sqlLiteral.quoteTable(table)} ADD FOREIGN KEY (${SqlCompiler.quoteIdent(column.field)}) ${ddl.referencesSql(column, schema) ?? ''}`,
        ),
      options,
    );
  }

  /** Orders definitions so that referenced tables come first. */
  #dependencyOrder(definitions: readonly ModelDefinition[]): readonly ModelDefinition[] {
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
      const withDependencies = this.#referencedTables(definition)
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
  }
}
