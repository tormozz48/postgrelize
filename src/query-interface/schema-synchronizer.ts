import { SqlLiteral } from '../ddl/sql-literal.ts';
import type { ModelDefinition } from '../model/model-definition.ts';
import type { ModelRuntime, QueryOptionsBase } from '../model/runtime.ts';
import { AlterPlanner } from './alter-planner.ts';
import { ModelTables } from './model-tables.ts';
import type { QueryInterface } from './query-interface.ts';
import { SyncPlanner } from './sync-planner.ts';

/**
 * `alter` options of `sync()`.
 *
 * @example
 * ```ts
 * const alter: AlterOptions = { drop: false };
 * await sequelize.sync({ alter });
 * ```
 */
export type AlterOptions = Readonly<{
  /** Drop columns that are not in the model. Default true. */
  drop?: boolean;
}>;

/**
 * Options of `sync()`: `force`, `alter`, `match`, `schema` plus the common query options.
 *
 * @example
 * ```ts
 * const options: SyncOptions = { alter: true, match: /_test$/, schema: 'tenant_1' };
 * await sequelize.sync(options);
 * ```
 */
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
    /** Run the `beforeSync` / `afterSync` hooks. Default true. */
    hooks?: boolean;
  }>;

/** Wraps the sync of one model (used to run its sync hooks). */
export type SyncWrapper = (definition: ModelDefinition, run: () => Promise<void>) => Promise<void>;

/**
 * Options of `drop()`: `cascade`, `schema` plus the common query options.
 *
 * @example
 * ```ts
 * const options: DropOptions = { cascade: true, schema: 'tenant_1' };
 * await sequelize.drop(options);
 * ```
 */
export type DropOptions = QueryOptionsBase &
  Readonly<{
    /** `DROP TABLE ... CASCADE`. */
    cascade?: boolean;
    /** Drop the tables in this schema instead of the models' schema. */
    schema?: string;
  }>;

const sqlLiteral = new SqlLiteral();

const planner = new SyncPlanner();

const tables = new ModelTables();

/**
 * Creates, alters and drops the tables of model definitions (`sync()` / `drop()`): dependency
 * order, deferred foreign keys for reference cycles, `force`, `alter` and the `schema` option.
 *
 * @internal
 */
export class SchemaSynchronizer {
  readonly #runtime: ModelRuntime;
  readonly #queryInterface: QueryInterface;
  readonly #alter: AlterPlanner;

  /**
   * @param runtime - Runtime executing the statements.
   * @param queryInterface - Query interface used to inspect and drop tables.
   */
  constructor(runtime: ModelRuntime, queryInterface: QueryInterface) {
    this.#runtime = runtime;
    this.#queryInterface = queryInterface;
    this.#alter = new AlterPlanner(queryInterface, tables);
  }

  /**
   * Syncs several models: referenced tables first, foreign keys of reference cycles added once
   * every table exists. With `force`, drops the tables in reverse order first.
   *
   * @param definitions - Model definitions.
   * @param options - `force`, `alter`, `schema` and query options.
   * @param wrap - Runs around the sync of each model.
   */
  async syncAll(
    definitions: readonly ModelDefinition[],
    options: SyncOptions = {},
    wrap: SyncWrapper = (_definition, run) => run(),
  ): Promise<void> {
    const ordered = planner.dependencyOrder(definitions);
    if (options.force === true) {
      await this.#each(ordered.toReversed(), (definition) =>
        this.drop(definition, { ...options, cascade: true }),
      );
    }
    await this.#syncOrdered(ordered, options, wrap);
  }

  async #syncOrdered(
    ordered: readonly ModelDefinition[],
    options: SyncOptions,
    wrap: SyncWrapper,
  ): Promise<void> {
    const deferred = planner.deferredReferences(ordered);
    await this.#each(ordered, (definition) =>
      wrap(definition, () =>
        this.sync(definition, { ...options, force: false }, deferred.get(definition)),
      ),
    );
    await this.#each(ordered, (definition) =>
      this.#addDeferredReferences(definition, deferred.get(definition) ?? [], options),
    );
  }

  /**
   * Order in which tables can be emptied: tables that reference others first. A reference cycle
   * cannot be ordered, so `cyclic` is set and the order is only a best effort.
   *
   * @param definitions - Model definitions.
   * @returns Definitions with referencing tables first, and whether foreign keys form a cycle.
   */
  truncationOrder(
    definitions: readonly ModelDefinition[],
  ): Readonly<{ models: readonly ModelDefinition[]; cyclic: boolean }> {
    const ordered = planner.dependencyOrder(definitions);
    const cyclic = [...planner.deferredReferences(ordered).values()].some(
      (columns) => columns.length > 0,
    );
    return { models: ordered.toReversed(), cyclic };
  }

  /**
   * Drops the tables of several models in reverse foreign-key order.
   *
   * @param definitions - Model definitions.
   * @param options - `cascade`, `schema` and query options.
   */
  async dropAll(definitions: readonly ModelDefinition[], options: DropOptions = {}): Promise<void> {
    const { models, cyclic } = this.truncationOrder(definitions);
    // like v6, a reference cycle is broken by removing the foreign keys first
    if (cyclic) {
      await this.#each(models, (definition) => this.#removeForeignKeys(definition, options));
    }
    await this.#each(models, (definition) => this.drop(definition, options));
  }

  async #removeForeignKeys(model: ModelDefinition, options: DropOptions): Promise<void> {
    const table = tables.tableOf(tables.inSchema(model, options.schema));
    const keys = Object.values(
      await this.#queryInterface.getForeignKeysForTables([table], options),
    ).flat();
    for (const name of keys) {
      await this.#queryInterface.removeConstraint(table, name, options);
    }
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
    const definition = tables.inSchema(model, options.schema);
    if (options.force === true) {
      await this.drop(definition, { ...options, cascade: true });
    }
    const statements = await this.#tableStatements(definition, options, deferred);
    await this.#run([...statements, ...tables.indexStatements(definition)], options);
  }

  /**
   * Drops the table of a model and its enum types.
   *
   * @param model - Model definition.
   * @param options - `cascade`, `schema` and query options.
   */
  async drop(model: ModelDefinition, options: DropOptions = {}): Promise<void> {
    const definition = tables.inSchema(model, options.schema);
    const table = tables.tableOf(definition);
    await this.#queryInterface.dropTable(table, options);
    const enumFields = [...definition.attributes.values()]
      .filter(
        (attribute) => attribute.type.key === 'ENUM' || attribute.type.subtype?.key === 'ENUM',
      )
      .map((attribute) => attribute.field);
    await this.#queryInterface.dropEnumsOf(table, enumFields, options);
  }

  async #tableStatements(
    definition: ModelDefinition,
    options: SyncOptions,
    deferred: readonly string[],
  ): Promise<readonly string[]> {
    const exists =
      options.force !== true &&
      (await this.#queryInterface.tableExists(tables.tableOf(definition), options));
    if (exists && options.alter !== undefined && options.alter !== false) {
      return await this.#alter.statements(definition, options.alter, options);
    }
    return exists ? [] : tables.createStatements(definition, deferred, options.schema);
  }

  async #each(
    definitions: readonly ModelDefinition[],
    action: (definition: ModelDefinition) => Promise<void>,
  ): Promise<void> {
    await definitions.reduce<Promise<unknown>>(
      (previous, definition) => previous.then(() => action(definition)),
      Promise.resolve(),
    );
  }

  async #run(statements: readonly string[], options: QueryOptionsBase): Promise<void> {
    await statements.reduce<Promise<unknown>>(
      (previous, text) => previous.then(() => this.#runtime.execute({ text, values: [] }, options)),
      Promise.resolve(),
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
    const definition = tables.inSchema(model, options.schema);
    const table = tables.tableOf(definition);
    const qualified = sqlLiteral.quoteTable(table);
    const existing = await this.#alter.foreignKeyColumns(table, options);
    await this.#run(
      tables
        .storedColumns(definition)
        .filter((column) => fields.includes(column.field) && !existing.has(column.field))
        .map((column) => tables.foreignKeySql(qualified, column, definition.schema)),
      options,
    );
  }
}
