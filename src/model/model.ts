import {
  SchemaSynchronizer,
  type DropOptions,
  type SyncOptions,
} from '../query-interface/schema-synchronizer.ts';
import { IncludeLoader } from '../associations/include-loader.ts';
import { IncludeQueryBuilder } from '../associations/include-query-builder.ts';
import { IncludeResolver } from '../associations/include-resolver.ts';
import { NestedCreator } from '../associations/nested-creator.ts';
import { BelongsTo } from '../associations/belongs-to.ts';
import { BelongsToMany } from '../associations/belongs-to-many.ts';
import { HasMany } from '../associations/has-many.ts';
import { HasOne } from '../associations/has-one.ts';
import type {
  Association,
  AssociationOptions,
  BelongsToManyOptions,
} from '../associations/types.ts';
import { CopyEncoder } from '../connection/copy.ts';
import { SqlLiteral } from '../ddl/sql-literal.ts';
import type { Subquery } from '../expressions/methods.ts';
import type { HookFunction, HookType } from '../hooks/hooks.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { InstanceValidator } from '../validation/instance-validator.ts';
import { AttributeColumns } from './attribute-columns.ts';
import { CteBuilder } from './cte-builder.ts';
import { DeleteQueryBuilder } from './delete-query-builder.ts';
import { FindQueryBuilder } from './find-query-builder.ts';
import { InsertQueryBuilder } from './insert-query-builder.ts';
import { InstanceLifecycle, type ValidateOptions } from './instance-lifecycle.ts';
import { InstanceState } from './instance-state.ts';
import { InstanceValues } from './instance-values.ts';
import { JoinSourceBuilder } from './join-source-builder.ts';
import { MergeQueryBuilder, type MergeOptions } from './merge-query-builder.ts';
import type {
  AttributeDefinition,
  DefinitionOptions,
  ModelAttributes,
} from './model-definition.ts';
import { ModelRegistry } from './model-registry.ts';
import { ModelValues } from './model-values.ts';
import { OnConflictBuilder } from './on-conflict-builder.ts';
import { BulkCreateOperation } from './operations/bulk-create-operation.ts';
import { CopyOperation } from './operations/copy-operation.ts';
import { CountOperation } from './operations/count-operation.ts';
import { CreateOperation } from './operations/create-operation.ts';
import { DestroyOperation } from './operations/destroy-operation.ts';
import { FindOperation } from './operations/find-operation.ts';
import { IncrementOperation } from './operations/increment-operation.ts';
import { InsertOperation } from './operations/insert-operation.ts';
import {
  MergeOperation,
  type MergeCallOptions,
  type MergeResult,
} from './operations/merge-operation.ts';
import { UpdateOperation } from './operations/update-operation.ts';
import { UpsertOperation } from './operations/upsert-operation.ts';
import { ReturningOld } from './returning-old.ts';
import { RowMapper } from './row-mapper.ts';
import type { QueryOptionsBase, RuntimeOwner } from './runtime.ts';
import type { ScopeDefinition, ScopeSelector } from './scope-registry.ts';
import { SelectQueryBuilder } from './select-query-builder.ts';
import { UpdateQueryBuilder } from './update-query-builder.ts';
import { WrittenRows } from './written-rows.ts';
import type {
  AggregateOptions,
  AnyModel,
  AttributeAmounts,
  Attributes,
  BuildOptions,
  BulkCreateOptions,
  CopyFromOptions,
  CopyToOptions,
  CountOptions,
  CreateOptions,
  CreationAttributes,
  DestroyOptions,
  FindAndCountResult,
  FindOptions,
  FindOrCreateOptions,
  IncrementOptions,
  InitOptions,
  InsertFromOptions,
  InsertOptions,
  InstanceDestroyOptions,
  ModelStatic,
  QualifiedTableName,
  RestoreOptions,
  SaveOptions,
  UpdateOptions,
  UpsertOptions,
  Values,
} from './options.ts';

const registry = new ModelRegistry();
const attributeColumns = new AttributeColumns();
const modelValues = new ModelValues();
const rowMapper = new RowMapper(registry);
const sqlCompiler = new SqlCompiler();
const selectQueries = new SelectQueryBuilder(attributeColumns);
const insertQueries = new InsertQueryBuilder(attributeColumns);
const updateQueries = new UpdateQueryBuilder(attributeColumns);
const deleteQueries = new DeleteQueryBuilder(attributeColumns);
const joinSources = new JoinSourceBuilder(registry, attributeColumns);
const cteBuilder = new CteBuilder(joinSources);
const onConflictBuilder = new OnConflictBuilder(attributeColumns);
const returningOld = new ReturningOld(attributeColumns, rowMapper);
const writtenRows = new WrittenRows(registry, rowMapper, returningOld);
const includeResolver = new IncludeResolver();
const includeQueries = new IncludeQueryBuilder();
const includeLoader = new IncludeLoader(includeResolver);
const isInstance = (value: unknown): value is AnyModel => value instanceof Model;
const nestedCreator = new NestedCreator(includeResolver, isInstance);
const findQueries = new FindQueryBuilder(selectQueries, cteBuilder, includeQueries);
const instanceValues = new InstanceValues(registry, modelValues, isInstance);
const lifecycle = new InstanceLifecycle({
  registry,
  values: modelValues,
  rows: rowMapper,
  columns: attributeColumns,
  selects: selectQueries,
  inserts: insertQueries,
  updates: updateQueries,
  deletes: deleteQueries,
  includes: includeResolver,
  nested: nestedCreator,
  validator: new InstanceValidator(),
  compiler: sqlCompiler,
});
const finder = new FindOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  selects: selectQueries,
  finds: findQueries,
  rows: rowMapper,
  includes: includeResolver,
  loader: includeLoader,
  compiler: sqlCompiler,
});
const counter = new CountOperation({
  registry,
  lifecycle,
  columns: attributeColumns,
  selects: selectQueries,
  cte: cteBuilder,
  rows: rowMapper,
  includes: includeResolver,
  includeQueries,
  compiler: sqlCompiler,
});
const inserter = new InsertOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  inserts: insertQueries,
  conflicts: onConflictBuilder,
  returningOld,
  written: writtenRows,
  compiler: sqlCompiler,
});
const creator = new CreateOperation({
  registry,
  lifecycle,
  values: modelValues,
  conflicts: onConflictBuilder,
  inserter,
});
const bulkCreator = new BulkCreateOperation({
  registry,
  lifecycle,
  values: modelValues,
  inserts: insertQueries,
  conflicts: onConflictBuilder,
  inserter,
  written: writtenRows,
  compiler: sqlCompiler,
});
const upserter = new UpsertOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  inserts: insertQueries,
  conflicts: onConflictBuilder,
  written: writtenRows,
  compiler: sqlCompiler,
});
const updater = new UpdateOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  joins: joinSources,
  returningOld,
  written: writtenRows,
  compiler: sqlCompiler,
});
const destroyer = new DestroyOperation({
  registry,
  lifecycle,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  deletes: deleteQueries,
  joins: joinSources,
  rows: rowMapper,
  compiler: sqlCompiler,
});
const incrementer = new IncrementOperation({
  registry,
  values: modelValues,
  columns: attributeColumns,
  updates: updateQueries,
  rows: rowMapper,
  compiler: sqlCompiler,
});
const merger = new MergeOperation({
  registry,
  merges: new MergeQueryBuilder(attributeColumns),
  returningOld,
  written: writtenRows,
  compiler: sqlCompiler,
});
const copier = new CopyOperation({
  registry,
  columns: attributeColumns,
  finds: findQueries,
  includes: includeResolver,
  encoder: new CopyEncoder(),
  literals: new SqlLiteral(),
  compiler: sqlCompiler,
});

/**
 * Base class of models, API-compatible with Sequelize v6 `Model`.
 *
 * @typeParam TAttributes - Attribute types (usually `InferAttributes<M>`).
 * @typeParam TCreationAttributes - Attribute types accepted on creation (usually `InferCreationAttributes<M>`).
 * @example
 * ```ts
 * class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
 *   declare id: CreationOptional<number>;
 *   declare email: string;
 * }
 * User.init({ id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, email: DataTypes.STRING }, { sequelize });
 * ```
 */
export class Model<
  TAttributes extends object = Values,
  TCreationAttributes extends object = TAttributes,
> {
  /** Adds a `beforeValidate` hook: `Model.beforeValidate(fn)` or `Model.beforeValidate(name, fn)`. */
  declare static beforeValidate: NamedHookAdder;
  /** Adds a `afterValidate` hook: `Model.afterValidate(fn)` or `Model.afterValidate(name, fn)`. */
  declare static afterValidate: NamedHookAdder;
  /** Adds a `validationFailed` hook: `Model.validationFailed(fn)` or `Model.validationFailed(name, fn)`. */
  declare static validationFailed: NamedHookAdder;
  /** Adds a `beforeCreate` hook: `Model.beforeCreate(fn)` or `Model.beforeCreate(name, fn)`. */
  declare static beforeCreate: NamedHookAdder;
  /** Adds a `afterCreate` hook: `Model.afterCreate(fn)` or `Model.afterCreate(name, fn)`. */
  declare static afterCreate: NamedHookAdder;
  /** Adds a `beforeUpdate` hook: `Model.beforeUpdate(fn)` or `Model.beforeUpdate(name, fn)`. */
  declare static beforeUpdate: NamedHookAdder;
  /** Adds a `afterUpdate` hook: `Model.afterUpdate(fn)` or `Model.afterUpdate(name, fn)`. */
  declare static afterUpdate: NamedHookAdder;
  /** Adds a `beforeSave` hook: `Model.beforeSave(fn)` or `Model.beforeSave(name, fn)`. */
  declare static beforeSave: NamedHookAdder;
  /** Adds a `afterSave` hook: `Model.afterSave(fn)` or `Model.afterSave(name, fn)`. */
  declare static afterSave: NamedHookAdder;
  /** Adds a `beforeDestroy` hook: `Model.beforeDestroy(fn)` or `Model.beforeDestroy(name, fn)`. */
  declare static beforeDestroy: NamedHookAdder;
  /** Adds a `afterDestroy` hook: `Model.afterDestroy(fn)` or `Model.afterDestroy(name, fn)`. */
  declare static afterDestroy: NamedHookAdder;
  /** Adds a `beforeRestore` hook: `Model.beforeRestore(fn)` or `Model.beforeRestore(name, fn)`. */
  declare static beforeRestore: NamedHookAdder;
  /** Adds a `afterRestore` hook: `Model.afterRestore(fn)` or `Model.afterRestore(name, fn)`. */
  declare static afterRestore: NamedHookAdder;
  /** Adds a `beforeUpsert` hook: `Model.beforeUpsert(fn)` or `Model.beforeUpsert(name, fn)`. */
  declare static beforeUpsert: NamedHookAdder;
  /** Adds a `afterUpsert` hook: `Model.afterUpsert(fn)` or `Model.afterUpsert(name, fn)`. */
  declare static afterUpsert: NamedHookAdder;
  /** Adds a `beforeBulkCreate` hook: `Model.beforeBulkCreate(fn)` or `Model.beforeBulkCreate(name, fn)`. */
  declare static beforeBulkCreate: NamedHookAdder;
  /** Adds a `afterBulkCreate` hook: `Model.afterBulkCreate(fn)` or `Model.afterBulkCreate(name, fn)`. */
  declare static afterBulkCreate: NamedHookAdder;
  /** Adds a `beforeBulkUpdate` hook: `Model.beforeBulkUpdate(fn)` or `Model.beforeBulkUpdate(name, fn)`. */
  declare static beforeBulkUpdate: NamedHookAdder;
  /** Adds a `afterBulkUpdate` hook: `Model.afterBulkUpdate(fn)` or `Model.afterBulkUpdate(name, fn)`. */
  declare static afterBulkUpdate: NamedHookAdder;
  /** Adds a `beforeBulkDestroy` hook: `Model.beforeBulkDestroy(fn)` or `Model.beforeBulkDestroy(name, fn)`. */
  declare static beforeBulkDestroy: NamedHookAdder;
  /** Adds a `afterBulkDestroy` hook: `Model.afterBulkDestroy(fn)` or `Model.afterBulkDestroy(name, fn)`. */
  declare static afterBulkDestroy: NamedHookAdder;
  /** Adds a `beforeBulkRestore` hook: `Model.beforeBulkRestore(fn)` or `Model.beforeBulkRestore(name, fn)`. */
  declare static beforeBulkRestore: NamedHookAdder;
  /** Adds a `afterBulkRestore` hook: `Model.afterBulkRestore(fn)` or `Model.afterBulkRestore(name, fn)`. */
  declare static afterBulkRestore: NamedHookAdder;
  /** Adds a `beforeFind` hook: `Model.beforeFind(fn)` or `Model.beforeFind(name, fn)`. */
  declare static beforeFind: NamedHookAdder;
  /** Adds a `beforeFindAfterExpandIncludeAll` hook: `Model.beforeFindAfterExpandIncludeAll(fn)` or `Model.beforeFindAfterExpandIncludeAll(name, fn)`. */
  declare static beforeFindAfterExpandIncludeAll: NamedHookAdder;
  /** Adds a `beforeFindAfterOptions` hook: `Model.beforeFindAfterOptions(fn)` or `Model.beforeFindAfterOptions(name, fn)`. */
  declare static beforeFindAfterOptions: NamedHookAdder;
  /** Adds a `afterFind` hook: `Model.afterFind(fn)` or `Model.afterFind(name, fn)`. */
  declare static afterFind: NamedHookAdder;
  /** Adds a `beforeCount` hook: `Model.beforeCount(fn)` or `Model.beforeCount(name, fn)`. */
  declare static beforeCount: NamedHookAdder;

  /** Phantom type of attributes; not set at runtime. */
  declare _attributes: TAttributes;
  /** Phantom type of creation attributes; not set at runtime. */
  declare _creationAttributes: TCreationAttributes;

  /** Current attribute values. */
  dataValues!: TAttributes;
  /** Values as of the last load/save. */
  _previousDataValues!: Partial<TAttributes>;
  /** True until the instance is saved or when built from a query result. */
  isNewRecord!: boolean;
  readonly #state = new InstanceState();

  /**
   * Builds an instance without saving it. Prefer `Model.build`.
   *
   * @param values - Attribute values.
   * @param options - Build options.
   */
  constructor(values: Partial<TCreationAttributes> | Values = {}, options: BuildOptions = {}) {
    lifecycle.initialize(this, values as Values, options);
  }

  /**
   * @internal Internal state of the instance (a method, so attribute type inference skips it).
   *
   * @returns The state.
   */
  [InstanceState.key](): InstanceState {
    return this.#state;
  }

  /** Model class of the instance. */
  get _model(): typeof Model {
    return this.constructor as typeof Model;
  }

  /**
   * For instances returned by `insert`, `create` / `bulkCreate` / `upsert` with `onConflict`:
   * true when the row was inserted, false when an existing row was updated (or nothing was
   * written). `undefined` otherwise. PostgreSQL extension.
   */
  get wasInserted(): boolean | undefined {
    return this.#state.wasInserted;
  }

  /**
   * For instances returned with `returningOld: true`: attribute values of the row before the
   * statement, or `null` when the row did not exist (inserted). `undefined` otherwise. PostgreSQL 18+.
   */
  get oldValues(): Readonly<Record<string, unknown>> | null | undefined {
    return this.#state.oldValues;
  }

  /** `Sequelize` instance the model belongs to. */
  get sequelize(): RuntimeOwner {
    return (this.constructor as typeof Model).sequelize;
  }

  /** Model name. */
  static get modelName(): string {
    return registry.state(this).definition.name;
  }

  /** Table name. */
  static get tableName(): string {
    return registry.state(this).definition.tableName;
  }

  /** Normalized attributes keyed by attribute name. */
  static get rawAttributes(): Readonly<Record<string, AttributeDefinition>> {
    return Object.fromEntries(registry.state(this).definition.attributes);
  }

  /** First primary key attribute name. */
  static get primaryKeyAttribute(): string | undefined {
    return registry.state(this).definition.primaryKeys[0];
  }

  /** All primary key attribute names. */
  static get primaryKeyAttributes(): readonly string[] {
    return registry.state(this).definition.primaryKeys;
  }

  /** Model options after defaults were applied. */
  static get options(): DefinitionOptions {
    return registry.state(this).definition.options;
  }

  /** `Sequelize` instance the model belongs to. */
  static get sequelize(): RuntimeOwner {
    return (
      registry.sequelizeOf(this) ??
      (() => {
        throw new Error('Model is not initialized.');
      })()
    );
  }

  /**
   * Defines attributes and options of the model and registers it in `sequelize.models`.
   *
   * @param attributes - Attribute definitions.
   * @param options - Model options, including the `sequelize` instance.
   * @returns The model class.
   */
  static init<MS extends ModelStatic<AnyModel>>(
    this: MS,
    attributes: ModelAttributes,
    options: InitOptions,
  ): MS {
    registry.init(this, attributes, options);
    return this;
  }

  /** Associations of the model by alias (Sequelize v6 `Model.associations`). */
  static get associations(): Readonly<Record<string, Association>> {
    return Object.fromEntries(
      registry.state(this).associations as ReadonlyMap<string, Association>,
    );
  }

  /**
   * Adds a belongsTo association: the foreign key is stored on this model.
   *
   * @param target - Associated model.
   * @param options - Association options.
   * @returns The association.
   */
  static belongsTo<M extends AnyModel, T extends AnyModel>(
    this: ModelStatic<M>,
    target: ModelStatic<T>,
    options?: AssociationOptions,
  ): Association {
    return new BelongsTo(this, target, options);
  }

  /**
   * Adds a hasOne association: the foreign key is stored on the target.
   *
   * @param target - Associated model.
   * @param options - Association options.
   * @returns The association.
   */
  static hasOne<M extends AnyModel, T extends AnyModel>(
    this: ModelStatic<M>,
    target: ModelStatic<T>,
    options?: AssociationOptions,
  ): Association {
    return new HasOne(this, target, options);
  }

  /**
   * Adds a hasMany association: the foreign key is stored on the target.
   *
   * @param target - Associated model.
   * @param options - Association options.
   * @returns The association.
   */
  static hasMany<M extends AnyModel, T extends AnyModel>(
    this: ModelStatic<M>,
    target: ModelStatic<T>,
    options?: AssociationOptions,
  ): Association {
    return new HasMany(this, target, options);
  }

  /**
   * Adds a belongsToMany association through a junction model.
   *
   * @param target - Associated model.
   * @param options - Association options with `through`.
   * @returns The association.
   */
  static belongsToMany<M extends AnyModel, T extends AnyModel>(
    this: ModelStatic<M>,
    target: ModelStatic<T>,
    options: BelongsToManyOptions,
  ): Association {
    return new BelongsToMany(this, target, options);
  }

  /**
   * Creates (or alters / re-creates) the table of this model.
   *
   * @param options - `force`, `alter` and query options.
   * @returns The model class.
   */
  static async sync<MS extends ModelStatic<AnyModel>>(
    this: MS,
    options: SyncOptions = {},
  ): Promise<MS> {
    const { definition, runtime } = registry.state(this);
    await new SchemaSynchronizer(runtime, runtime.queryInterface()).sync(definition, options);
    return this;
  }

  /**
   * Drops the table of this model and its enum types.
   *
   * @param options - `cascade` and query options.
   * @returns Resolves when done.
   */
  static async drop(options: DropOptions = {}): Promise<void> {
    const { definition, runtime } = registry.state(this);
    await new SchemaSynchronizer(runtime, runtime.queryInterface()).drop(definition, options);
  }

  /**
   * Builds a SELECT that can be embedded in another query: in `where` (`[Op.in]`, `=`, `exists()`),
   * in `attributes` (scalar subquery) and as a source of `insertFrom` / `merge`. Default scope and
   * paranoid filter apply; values stay bound parameters of the outer statement. PostgreSQL extension.
   *
   * @param options - Find options (`attributes`, `where`, `order`, `limit`, `include`, ...) and `as` (table alias).
   * @returns Subquery expression.
   * @example
   * ```ts
   * await User.findAll({ where: { id: { [Op.in]: Post.subquery({ attributes: ['userId'], where: { published: true } }) } } });
   * ```
   */
  static subquery<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> & Readonly<{ as?: string }> = {},
  ): Subquery {
    return finder.subquery(this, options as FindOptions & Readonly<{ as?: string }>);
  }

  /**
   * `INSERT INTO ... SELECT`: inserts the rows produced by a subquery. Returns the inserted (or, with
   * `onConflict`, updated) rows with `wasInserted`. PostgreSQL extension.
   *
   * @param source - Subquery from `Model.subquery()`; its columns must match `options.columns`.
   * @param options - Target columns, `onConflict` and query options.
   * @returns Written rows.
   * @example
   * ```ts
   * await Archive.insertFrom(Post.subquery({ attributes: ['id', 'title'], where: { published: false } }), { columns: ['postId', 'title'] });
   * ```
   */
  static insertFrom<M extends AnyModel>(
    this: ModelStatic<M>,
    source: Subquery,
    options: InsertFromOptions<Attributes<M>>,
  ): Promise<M[]> {
    return inserter.insertFrom(this, source, options as InsertFromOptions);
  }

  /**
   * `MERGE INTO ... USING ...` (PostgreSQL 15+). With `returning: true` (PostgreSQL 17+) returns the
   * written rows with the action taken. PostgreSQL extension.
   *
   * @param options - Source, join condition and WHEN clauses.
   * @returns Affected row count and, with `returning`, `{ action, instance }` per row.
   * @example
   * ```ts
   * await Stock.merge({
   *   source: [{ sku: 'a', qty: 5 }],
   *   on: { sku: col('source.sku') },
   *   whenMatched: { update: { qty: literal('"Stock"."qty" + "source"."qty"') } },
   *   whenNotMatched: { insert: true },
   * });
   * ```
   */
  static merge<M extends AnyModel>(
    this: ModelStatic<M>,
    options: MergeOptions<Attributes<M>> &
      QueryOptionsBase &
      Readonly<{
        /** Return written rows (PostgreSQL 17+). */
        returning?: boolean;
        /** With `returning`: expose pre-statement values as `instance.oldValues` (PostgreSQL 18+). */
        returningOld?: boolean;
      }>,
  ): Promise<MergeResult<M>> {
    return merger.merge(this, options as MergeCallOptions);
  }

  /**
   * Streams rows with a server-side cursor (`DECLARE ... CURSOR` + `FETCH n`), so large result sets
   * are not loaded at once. Runs inside `options.transaction` or its own transaction; the cursor is
   * closed when iteration ends or is stopped early. Joined includes are not supported. PostgreSQL extension.
   *
   * @param options - Find options.
   * @param cursor - `batchSize` (rows per FETCH, default 100).
   * @returns Async iterator of instances.
   * @example
   * ```ts
   * for await (const user of User.findEach({ where: { active: true } }, { batchSize: 500 })) {
   *   await sendEmail(user);
   * }
   * ```
   */
  static findEach<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
    cursor: Readonly<{ batchSize?: number }> = {},
  ): AsyncGenerator<M, void, undefined> {
    return finder.findEach(this, options as FindOptions, cursor);
  }

  /**
   * Bulk-loads rows with `COPY ... FROM STDIN` (text format) — much faster than INSERT for large
   * volumes. No hooks or validation run; missing values are written as `NULL`. `createdAt` /
   * `updatedAt` are filled when the model has timestamps. PostgreSQL extension.
   *
   * @param rows - Rows (array, iterable or async iterable of attribute values).
   * @param options - `columns` (attribute names; default: keys of the first row of an array) and query options.
   * @returns Number of copied rows.
   * @example
   * ```ts
   * await Event.copyFrom(readEvents(), { columns: ['type', 'payload'] });
   * ```
   */
  static copyFrom<M extends AnyModel>(
    this: ModelStatic<M>,
    rows: Iterable<CreationAttributes<M>> | AsyncIterable<CreationAttributes<M>>,
    options: CopyFromOptions<Attributes<M>> = {},
  ): Promise<number> {
    return copier.copyFrom(
      this,
      rows as Iterable<Values> | AsyncIterable<Values>,
      options as CopyFromOptions,
    );
  }

  /**
   * Streams `COPY (SELECT ...) TO STDOUT` output — the fastest way to export rows (e.g. CSV). Default
   * scope, paranoid filter, `with` / `source` and includes apply. Values of the query are inlined as
   * escaped literals because COPY cannot take parameters (ADR-013). Stopping early drains the rest
   * before the connection is released. PostgreSQL extension.
   *
   * @param options - Find options and output format.
   * @returns Async iterator of raw output chunks.
   * @example
   * ```ts
   * for await (const chunk of User.copyTo({ attributes: ['id', 'email'], format: 'csv', header: true })) {
   *   response.write(chunk);
   * }
   * ```
   */
  static copyTo<M extends AnyModel>(
    this: ModelStatic<M>,
    options: CopyToOptions<Attributes<M>> = {},
  ): AsyncGenerator<Buffer, void, undefined> {
    return copier.copyTo(this, options as CopyToOptions);
  }

  /**
   * Adds a lifecycle hook.
   *
   * @param type - Hook type, e.g. `'beforeCreate'`.
   * @param nameOrFn - Hook name (to remove it later) or the hook function.
   * @param fn - Hook function when a name is given.
   * @returns The model class.
   */
  static addHook<MS extends ModelStatic<AnyModel>>(
    this: MS,
    type: HookType,
    nameOrFn: string | HookFunction,
    fn?: HookFunction,
  ): MS {
    registry.addHook(this, type, nameOrFn, fn);
    return this;
  }

  /**
   * Removes hooks by name or function.
   *
   * @param type - Hook type.
   * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
   * @returns The model class.
   */
  static removeHook<MS extends ModelStatic<AnyModel>>(
    this: MS,
    type: HookType,
    nameOrFn?: string | HookFunction,
  ): MS {
    registry.removeHook(this, type, nameOrFn);
    return this;
  }

  /**
   * Checks whether hooks of the type are registered on the model.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   */
  static hasHook(type: HookType): boolean {
    return registry.state(this).hooks.has(type);
  }

  /**
   * Alias of {@link Model.hasHook}.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   */
  static hasHooks(type: HookType): boolean {
    return this.hasHook(type);
  }

  /**
   * Runs the hooks of a type with the given arguments (model hooks, then Sequelize-level hooks).
   *
   * @param type - Hook type.
   * @param args - Hook arguments.
   * @returns Resolves when all hooks finished.
   */
  static runHooks(type: HookType, ...args: readonly unknown[]): Promise<void> {
    return lifecycle.runHooks(this, type, ...args);
  }

  /**
   * Returns a model class using the given scopes instead of the default scope.
   *
   * @param selectors - Scope names, `{ method: [name, ...args] }`, inline options, `'defaultScope'`, or `null`.
   * @returns Scoped model class (instances are instances of this model).
   */
  static scope<MS extends ModelStatic<AnyModel>>(
    this: MS,
    ...selectors: readonly (ScopeSelector | readonly ScopeSelector[])[]
  ): MS {
    const Scoped = { [this.name]: class extends (this as unknown as typeof Model) {} }[
      this.name
    ] as unknown as MS;
    const flat = selectors.flatMap((selector) =>
      Array.isArray(selector) ? selector : [selector],
    ) as readonly ScopeSelector[];
    registry.selectScopes(this, Scoped, flat);
    return Scoped;
  }

  /**
   * Returns a model class without any scope (not even the default scope).
   *
   * @returns Unscoped model class.
   */
  static unscoped<MS extends ModelStatic<AnyModel>>(this: MS): MS {
    return this.scope();
  }

  /**
   * Adds a named scope (or replaces the default scope with name `'defaultScope'`).
   *
   * @param name - Scope name.
   * @param scope - Options or a function returning options.
   * @param options - `override: true` replaces an existing scope.
   * @throws Error when the scope exists and `override` is not set.
   */
  static addScope(
    name: string,
    scope: ScopeDefinition,
    options: Readonly<{ override?: boolean }> = {},
  ): void {
    registry.addScope(this, name, scope, options.override === true);
  }

  /**
   * Normalized attributes keyed by attribute name.
   *
   * @returns Attribute definitions.
   */
  static getAttributes(): Readonly<Record<string, AttributeDefinition>> {
    return this.rawAttributes;
  }

  /**
   * Table name, or `{ tableName, schema }` when the model has a schema.
   *
   * @returns Table name or qualified table.
   */
  static getTableName(): string | QualifiedTableName {
    const { definition } = registry.state(this);
    return definition.schema === undefined
      ? definition.tableName
      : { tableName: definition.tableName, schema: definition.schema, delimiter: '.' };
  }

  /**
   * Builds an unsaved instance.
   *
   * @param values - Attribute values.
   * @param options - Build options.
   * @returns New instance.
   */
  static build<M extends AnyModel>(
    this: ModelStatic<M>,
    values?: CreationAttributes<M> | Values,
    options?: BuildOptions,
  ): M {
    return new this(values as Values, options);
  }

  /**
   * Builds several unsaved instances.
   *
   * @param records - Attribute values per instance.
   * @param options - Build options.
   * @returns New instances.
   */
  static bulkBuild<M extends AnyModel>(
    this: ModelStatic<M>,
    records: readonly (CreationAttributes<M> | Values)[],
    options?: BuildOptions,
  ): M[] {
    return records.map((values) => new this(values as Values, options));
  }

  /**
   * Builds and saves an instance.
   *
   * @param values - Attribute values.
   * @param options - Save options.
   * @returns Saved instance.
   * @throws UniqueConstraintError, ForeignKeyConstraintError, DatabaseError.
   */
  static create<M extends AnyModel>(
    this: ModelStatic<M>,
    values?: CreationAttributes<M>,
    options: CreateOptions<Attributes<M>> = {},
  ): Promise<M> {
    return creator.create(this, values as Values | undefined, options as CreateOptions);
  }

  /**
   * Inserts rows with `INSERT ... ON CONFLICT` and returns the inserted or updated rows. Unlike
   * `bulkCreate`, rows skipped by `DO NOTHING` or by the `DO UPDATE ... WHERE` condition are not
   * returned. Each instance has `wasInserted`. PostgreSQL extension.
   *
   * @param values - Attribute values of one row or several rows.
   * @param options - Insert options.
   * @returns Instances of the rows written by the statement.
   * @example
   * ```ts
   * const rows = await Stock.insert(items, {
   *   onConflict: { target: ['sku'], action: { update: { qty: literal('"Stock"."qty" + EXCLUDED."qty"') } } },
   * });
   * rows.filter((row) => row.wasInserted);
   * ```
   */
  static insert<M extends AnyModel>(
    this: ModelStatic<M>,
    values: CreationAttributes<M> | readonly CreationAttributes<M>[],
    options: InsertOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    return inserter.insert(this, values as Values | readonly Values[], options as InsertOptions);
  }

  /**
   * Inserts a row or updates it when it conflicts with a unique key (Sequelize v6 `upsert`).
   *
   * @param values - Attribute values.
   * @param options - Upsert options.
   * @returns `[instance, null]` like Sequelize v6, or `[instance, created]` with `onConflict`.
   */
  static upsert<M extends AnyModel>(
    this: ModelStatic<M>,
    values: CreationAttributes<M>,
    options: UpsertOptions<Attributes<M>> = {},
  ): Promise<[M, boolean | null]> {
    return upserter.upsert(this, values as Values, options as UpsertOptions);
  }

  /**
   * Inserts many rows with one statement.
   *
   * @param records - Attribute values per row.
   * @param options - Options.
   * @returns Instances with values returned by the database.
   */
  static bulkCreate<M extends AnyModel>(
    this: ModelStatic<M>,
    records: readonly CreationAttributes<M>[],
    options: BulkCreateOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    return bulkCreator.bulkCreate(this, records as readonly Values[], options as BulkCreateOptions);
  }

  /**
   * Finds all rows matching the options (default scope and paranoid filter applied).
   *
   * @param options - Query options.
   * @returns Instances, or plain objects with `raw: true`.
   */
  static findAll<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    return finder.findAll(this, options as FindOptions);
  }

  /**
   * Finds the first row matching the options, throwing when none is found.
   *
   * @param options - Query options with `rejectOnEmpty`.
   * @returns Instance.
   * @throws EmptyResultError (or the given error) when nothing is found.
   */
  static findOne<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> & Readonly<{ rejectOnEmpty: true | Error }>,
  ): Promise<M>;
  /**
   * Finds the first row matching the options.
   *
   * @param options - Query options.
   * @returns Instance or `null`.
   */
  static findOne<M extends AnyModel>(
    this: ModelStatic<M>,
    options?: FindOptions<Attributes<M>>,
  ): Promise<M | null>;
  static findOne<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<M | null> {
    return finder.findOne(this, options as FindOptions);
  }

  /**
   * Finds a row by primary key.
   *
   * @param key - Primary key value.
   * @param options - Query options.
   * @returns Instance or `null`.
   */
  static findByPk<M extends AnyModel>(
    this: ModelStatic<M>,
    key: unknown,
    options: Omit<FindOptions<Attributes<M>>, 'where'> = {},
  ): Promise<M | null> {
    return finder.findByPk(this, key, options as Omit<FindOptions, 'where'>);
  }

  /**
   * Counts rows (default scope and paranoid filter applied).
   *
   * @param options - Count options.
   * @returns Count, or `{ count, ...groups }[]` with `group`.
   */
  static count<M extends AnyModel>(
    this: ModelStatic<M>,
    options: CountOptions<Attributes<M>> = {},
  ): Promise<number> {
    return counter.count(this, options as CountOptions);
  }

  /**
   * Runs `findAll` and `count` with the same filter.
   *
   * @param options - Query options.
   * @returns Total count and the current page of rows.
   */
  static findAndCountAll<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<FindAndCountResult<M>> {
    return finder.findAndCountAll(this, options as FindOptions);
  }

  /**
   * Runs an aggregate function over a column.
   *
   * @param field - Attribute name or `'*'`.
   * @param aggregateFunction - SQL aggregate function name, e.g. `'max'`.
   * @param options - Options.
   * @returns Aggregated value.
   */
  static aggregate<M extends AnyModel, T = unknown>(
    this: ModelStatic<M>,
    field: keyof Attributes<M> | '*',
    aggregateFunction: string,
    options: AggregateOptions<Attributes<M>> = {},
  ): Promise<T> {
    return counter.aggregate(
      this,
      String(field),
      aggregateFunction,
      options as AggregateOptions,
    ) as Promise<T>;
  }

  /**
   * Maximum value of an attribute.
   *
   * @param field - Attribute name.
   * @param options - Options.
   * @returns Maximum or `null`.
   */
  static max<M extends AnyModel, T = unknown>(
    this: ModelStatic<M>,
    field: keyof Attributes<M>,
    options?: AggregateOptions<Attributes<M>>,
  ): Promise<T> {
    return (this as unknown as typeof Model).aggregate.call(
      this,
      field as never,
      'max',
      options as AggregateOptions,
    ) as Promise<T>;
  }

  /**
   * Minimum value of an attribute.
   *
   * @param field - Attribute name.
   * @param options - Options.
   * @returns Minimum or `null`.
   */
  static min<M extends AnyModel, T = unknown>(
    this: ModelStatic<M>,
    field: keyof Attributes<M>,
    options?: AggregateOptions<Attributes<M>>,
  ): Promise<T> {
    return (this as unknown as typeof Model).aggregate.call(
      this,
      field as never,
      'min',
      options as AggregateOptions,
    ) as Promise<T>;
  }

  /**
   * Sum of an attribute.
   *
   * @param field - Attribute name.
   * @param options - Options.
   * @returns Sum or `null`.
   */
  static sum<M extends AnyModel>(
    this: ModelStatic<M>,
    field: keyof Attributes<M>,
    options?: AggregateOptions<Attributes<M>>,
  ): Promise<number> {
    return (this as unknown as typeof Model).aggregate.call(
      this,
      field as never,
      'sum',
      options as AggregateOptions,
    ) as Promise<number>;
  }

  /**
   * Updates rows matching `where`.
   *
   * @param values - New attribute values.
   * @param options - Update options.
   * @returns `[affectedCount]`, or `[affectedCount, rows]` with `returning: true`.
   */
  static update<M extends AnyModel>(
    this: ModelStatic<M>,
    values: Partial<Attributes<M>>,
    options: UpdateOptions<Attributes<M>>,
  ): Promise<[affectedCount: number, affectedRows?: M[]]> {
    return updater.update(this, values as Values, options as UpdateOptions);
  }

  /**
   * Deletes rows matching `where`.
   *
   * @param options - Destroy options.
   * @returns Number of deleted rows, or deleted instances with `returning: true`.
   */
  static destroy<M extends AnyModel>(
    this: ModelStatic<M>,
    options: DestroyOptions<Attributes<M>> & Readonly<{ returning: true }>,
  ): Promise<M[]>;
  /**
   * Deletes rows matching `where`.
   *
   * @param options - Destroy options.
   * @returns Number of deleted rows.
   */
  static destroy<M extends AnyModel>(
    this: ModelStatic<M>,
    options?: DestroyOptions<Attributes<M>>,
  ): Promise<number>;
  static destroy<M extends AnyModel>(
    this: ModelStatic<M>,
    options: DestroyOptions<Attributes<M>> = {},
  ): Promise<number | M[]> {
    return destroyer.destroy(this, options as DestroyOptions);
  }

  /**
   * Restores soft-deleted rows of a paranoid model (`deletedAt = NULL`).
   *
   * @param options - Rows to restore and hook options.
   * @returns Resolves when done.
   * @throws Error when the model is not paranoid.
   */
  static restore<M extends AnyModel>(
    this: ModelStatic<M>,
    options: RestoreOptions<Attributes<M>> = {},
  ): Promise<void> {
    return destroyer.restore(this, options as RestoreOptions);
  }

  /**
   * Empties the table.
   *
   * @param options - `cascade`, `restartIdentity` and query options.
   * @returns Resolves when done.
   */
  static truncate(
    options: QueryOptionsBase & Readonly<{ cascade?: boolean; restartIdentity?: boolean }> = {},
  ): Promise<void> {
    return destroyer.truncate(this, options);
  }

  /**
   * Increments attributes of rows matching `where` (`SET x = x + by`).
   *
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param options - Increment options.
   * @returns Updated instances.
   */
  static increment<M extends AnyModel>(
    this: ModelStatic<M>,
    fields: AttributeAmounts<Attributes<M>>,
    options: IncrementOptions<Attributes<M>> = {},
  ): Promise<[affectedRows: M[], affectedCount: number]> {
    return incrementer.change(
      this,
      fields as AttributeAmounts<Values>,
      options as IncrementOptions,
      1,
    );
  }

  /**
   * Decrements attributes of rows matching `where` (`SET x = x - by`).
   *
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param options - Decrement options.
   * @returns Updated instances.
   */
  static decrement<M extends AnyModel>(
    this: ModelStatic<M>,
    fields: AttributeAmounts<Attributes<M>>,
    options: IncrementOptions<Attributes<M>> = {},
  ): Promise<[affectedRows: M[], affectedCount: number]> {
    return incrementer.change(
      this,
      fields as AttributeAmounts<Values>,
      options as IncrementOptions,
      -1,
    );
  }

  /**
   * Finds a row or creates it inside a transaction.
   *
   * @param options - `where` to search, `defaults` to add on creation.
   * @returns `[instance, created]`.
   */
  static findOrCreate<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOrCreateOptions<Attributes<M>>,
  ): Promise<[M, boolean]> {
    return finder.findOrCreate(this, options as FindOrCreateOptions);
  }

  /**
   * Finds a row or builds (without saving) a new instance.
   *
   * @param options - `where` to search, `defaults` to add when building.
   * @returns `[instance, built]`.
   */
  static findOrBuild<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOrCreateOptions<Attributes<M>>,
  ): Promise<[M, boolean]> {
    return finder.findOrBuild(this, options as FindOrCreateOptions);
  }

  /**
   * Returns attribute values.
   *
   * @param options - `plain: true` returns a copy of all values with custom getters applied.
   * @returns Values object.
   */
  get(options?: Readonly<{ plain?: boolean; raw?: boolean; clone?: boolean }>): TAttributes;
  /**
   * Returns one attribute value, applying its custom getter unless `raw` is set.
   *
   * @param key - Attribute name.
   * @param options - `raw: true` skips the custom getter.
   * @returns Attribute value.
   */
  get<K extends keyof TAttributes>(key: K, options?: Readonly<{ raw?: boolean }>): TAttributes[K];
  get(
    keyOrOptions?: string | number | symbol | Readonly<{ plain?: boolean; raw?: boolean }>,
    options: Readonly<{ raw?: boolean }> = {},
  ): unknown {
    return instanceValues.get(this, keyOrOptions, options);
  }

  /**
   * Sets one attribute value, applying its custom setter unless `raw` is set.
   *
   * @param key - Attribute name.
   * @param value - New value.
   * @param options - `raw: true` skips the custom setter and change tracking.
   * @returns This instance.
   */
  set<K extends keyof TAttributes>(
    key: K,
    value: TAttributes[K],
    options?: Readonly<{ raw?: boolean }>,
  ): this;
  /**
   * Sets several attribute values.
   *
   * @param values - Attribute values.
   * @param options - `raw: true` skips custom setters and change tracking.
   * @returns This instance.
   */
  set(values: Partial<TAttributes> | Values, options?: Readonly<{ raw?: boolean }>): this;
  set(
    keyOrValues: string | number | symbol | Values,
    valueOrOptions?: unknown,
    maybeOptions?: Readonly<{ raw?: boolean }>,
  ): this {
    instanceValues.set(this, keyOrValues, valueOrOptions, maybeOptions);
    return this;
  }

  /**
   * Reads a value without custom getters.
   *
   * @param key - Attribute name.
   * @returns Raw value.
   */
  getDataValue<K extends keyof TAttributes>(key: K): TAttributes[K] {
    return this.dataValues[key];
  }

  /**
   * Writes a value without custom setters, tracking the change.
   *
   * @param key - Attribute name.
   * @param value - New value.
   * @returns This instance.
   */
  setDataValue<K extends keyof TAttributes>(key: K, value: TAttributes[K]): this {
    instanceValues.setDataValue(this, key, value);
    return this;
  }

  /**
   * Lists changed attributes, or checks one.
   *
   * @returns Changed attribute names, or `false` when nothing changed.
   */
  changed(): (keyof TAttributes & string)[] | false;
  /**
   * Checks whether an attribute changed.
   *
   * @param key - Attribute name.
   * @returns True when changed.
   */
  changed(key: keyof TAttributes & string): boolean;
  /**
   * Marks an attribute as changed or unchanged.
   *
   * @param key - Attribute name.
   * @param value - Changed flag.
   */
  changed(key: keyof TAttributes & string, value: boolean): void;
  changed(key?: string, value?: boolean): unknown {
    return instanceValues.changed(this, key, value);
  }

  /**
   * Previous value of an attribute, or all previous values of changed attributes.
   *
   * @param key - Attribute name.
   * @returns Previous value(s).
   */
  previous<K extends keyof TAttributes>(
    key?: K,
  ): TAttributes[K] | Partial<TAttributes> | undefined {
    return instanceValues.previous(this, key) as TAttributes[K] | Partial<TAttributes> | undefined;
  }

  /**
   * Inserts the instance if new, otherwise updates its changed attributes.
   *
   * @param options - Save options.
   * @returns This instance with values returned by the database.
   */
  save(options: SaveOptions<TAttributes> = {}): Promise<this> {
    return lifecycle.save(this, options as SaveOptions);
  }

  /**
   * Validates the instance (Sequelize v6 `instance.validate()`).
   *
   * @param options - `hooks`, `skip`, `fields`.
   * @returns Resolves when valid.
   * @throws ValidationError with all failures.
   */
  validate(options: ValidateOptions = {}): Promise<void> {
    return lifecycle.validate(this, options);
  }

  /**
   * Sets values and saves.
   *
   * @param values - New values.
   * @param options - Save options.
   * @returns This instance.
   */
  async update(
    values: Partial<TAttributes>,
    options: SaveOptions<TAttributes> = {},
  ): Promise<this> {
    this.set(values);
    return this.save(options);
  }

  /**
   * Reloads values from the database.
   *
   * @param options - Query options.
   * @returns This instance.
   * @throws InstanceError when the row no longer exists.
   */
  reload(options: QueryOptionsBase = {}): Promise<this> {
    return lifecycle.reload(this, options);
  }

  /**
   * Deletes the row of this instance.
   *
   * @param options - Query options.
   * @returns Resolves when deleted.
   */
  destroy(options: InstanceDestroyOptions = {}): Promise<void> {
    return lifecycle.destroy(this, options);
  }

  /**
   * Restores this soft-deleted instance of a paranoid model.
   *
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns Resolves when restored.
   * @throws Error when the model is not paranoid.
   */
  restore(options: QueryOptionsBase & Readonly<{ hooks?: boolean }> = {}): Promise<void> {
    return lifecycle.restore(this, options);
  }

  /**
   * Whether this instance of a paranoid model is soft-deleted.
   *
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   */
  isSoftDeleted(): boolean {
    return lifecycle.isSoftDeleted(this);
  }

  /**
   * Increments attributes of this row in the database. Does not reload the instance.
   *
   * @param fields - Attribute name(s) or map of amounts.
   * @param options - Options.
   * @returns This instance.
   */
  async increment(
    fields: AttributeAmounts<TAttributes>,
    options: Omit<IncrementOptions<TAttributes>, 'where'> = {},
  ): Promise<this> {
    await lifecycle.changeBy(
      this,
      'increment',
      fields as AttributeAmounts<Values>,
      options as Omit<IncrementOptions, 'where'>,
    );
    return this;
  }

  /**
   * Decrements attributes of this row in the database. Does not reload the instance.
   *
   * @param fields - Attribute name(s) or map of amounts.
   * @param options - Options.
   * @returns This instance.
   */
  async decrement(
    fields: AttributeAmounts<TAttributes>,
    options: Omit<IncrementOptions<TAttributes>, 'where'> = {},
  ): Promise<this> {
    await lifecycle.changeBy(
      this,
      'decrement',
      fields as AttributeAmounts<Values>,
      options as Omit<IncrementOptions, 'where'>,
    );
    return this;
  }

  /**
   * Compares primary keys with another instance.
   *
   * @param other - Instance to compare with.
   * @returns True when all primary key values are equal.
   */
  equals(other: Model): boolean {
    return instanceValues.equals(this, other);
  }

  /**
   * Plain copy of all values with custom getters applied.
   *
   * @returns Plain object.
   */
  toJSON(): TAttributes {
    return structuredClone(this.get({ plain: true }));
  }
}

/** Named hook method of a model class, e.g. `Model.beforeCreate`. */
export type NamedHookAdder = {
  /**
   * @param fn - Hook function.
   */
  (fn: HookFunction): void;
  /**
   * @param name - Hook name, used to remove it later.
   * @param fn - Hook function.
   */
  (name: string, fn: HookFunction): void;
};

const NAMED_HOOKS = [
  'beforeValidate',
  'afterValidate',
  'validationFailed',
  'beforeCreate',
  'afterCreate',
  'beforeUpdate',
  'afterUpdate',
  'beforeSave',
  'afterSave',
  'beforeDestroy',
  'afterDestroy',
  'beforeRestore',
  'afterRestore',
  'beforeUpsert',
  'afterUpsert',
  'beforeBulkCreate',
  'afterBulkCreate',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeBulkRestore',
  'afterBulkRestore',
  'beforeFind',
  'beforeFindAfterExpandIncludeAll',
  'beforeFindAfterOptions',
  'afterFind',
  'beforeCount',
] as const satisfies readonly HookType[];

NAMED_HOOKS.forEach((type) => {
  Object.defineProperty(Model, type, {
    configurable: true,
    writable: true,
    value(this: typeof Model, nameOrFn: string | HookFunction, fn?: HookFunction): void {
      this.addHook(type, nameOrFn, fn);
    },
  });
});
