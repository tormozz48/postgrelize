import {
  dropModel,
  syncModel,
  type DropOptions,
  type SyncOptions,
} from '../query-interface/sync.ts';
import {
  assembleInstances,
  countJoins,
  loadSeparate,
  normalizeIncludes,
  parseRawRow,
  toIncludeOptions,
  type IncludeNode,
  withIncludes,
  type IncludeOption,
} from '../associations/include.ts';
import {
  associationsOf,
  belongsTo as defineBelongsTo,
  belongsToMany as defineBelongsToMany,
  hasMany as defineHasMany,
  hasOne as defineHasOne,
} from '../associations/associate.ts';
import type {
  Association,
  AssociationOptions,
  BelongsToManyOptions,
} from '../associations/types.ts';
import {
  AggregateError,
  BulkRecordError,
  EmptyResultError,
  InstanceError,
  OptimisticLockError,
} from '../errors/errors.ts';
import {
  addHook,
  hasHook,
  hooksFromOption,
  removeHook,
  type HookFunction,
  type HookType,
} from '../hooks/hooks.ts';
import {
  runModelHooks,
  validateWithHooks,
  withParanoid,
  type ValidateOptions,
} from './lifecycle.ts';
import {
  injectScope,
  resolveScopes,
  type ScopeDefinition,
  type ScopeOptions,
  type ScopeSelector,
} from './scopes.ts';
import { isExpression, subqueryExpression, type Subquery } from '../expressions/methods.ts';
import { compile } from '../sql/compile.ts';
import {
  normalizeDefinition,
  type AttributeDefinition,
  type DefinitionOptions,
  type ModelAttributes,
  type ModelDefinition,
} from './definition.ts';
import {
  buildAggregate,
  buildCount,
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  incrementItems,
  primaryKeyWhere,
  setItems,
  tableOf,
  whereContext,
  type SelectOptions,
} from './query-builders.ts';
import { parseRow } from './rows.ts';
import { escapeLiteral, inlineValues } from '../ddl/literals.ts';
import { cteSelectOptions, sourceDefinition } from './cte.ts';
import { encodeCopyRow } from '../connection/copy.ts';
import { quoteIdent } from '../sql/compile.ts';
import { randomUUID } from 'node:crypto';
import type { Transaction } from '../transaction/transaction.ts';
import { buildMerge, joinSources, MERGE_ACTION, type MergeOptions } from './write-power.ts';
import {
  buildOnConflict,
  INSERTED_FLAG,
  insertedFlagColumn,
  type OnConflictOptions,
} from './on-conflict.ts';
import { OLD_PREFIX, returningAll, withReturningOld } from './query-builders.ts';
import type { OnConflictNode } from '../sql/ast.ts';
import { runtimeKey, type QueryOptionsBase, type RuntimeOwner } from './runtime.ts';
import type { WhereOptions } from './types.ts';
import type {
  AggregateOptions,
  AnyModel,
  AttributeAmounts,
  Attributes,
  BuildOptions,
  BulkCreateOptions,
  CopyFromOptions,
  CopyToFormatOptions,
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
import {
  activeScope,
  defineAttributeAccessors,
  initialState,
  selectScopes,
  states,
  stateOf,
  updateState,
} from './state.ts';
import {
  initialValues,
  isEqualValue,
  nestRow,
  parseAggregate,
  pickFields,
  pickQueryOptions,
  plainWhereValues,
  toAmounts,
  withTimestamps,
} from './values.ts';
import {
  V6_CONFLICT_OPTIONS,
  v6BulkConflict,
  v6UpsertConflict,
  withoutGeneratedKey,
} from './conflict.ts';

const insertedFlags = new WeakMap<object, boolean>();
const oldValuesOf = new WeakMap<object, Readonly<Record<string, unknown>> | null>();

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
  dataValues: TAttributes;
  /** Values as of the last load/save. */
  _previousDataValues: Partial<TAttributes>;
  /** True until the instance is saved or when built from a query result. */
  isNewRecord: boolean;
  #changed: ReadonlySet<string> = new Set();
  #includes: readonly IncludeNode[] = [];

  /**
   * Builds an instance without saving it. Prefer `Model.build`.
   *
   * @param values - Attribute values.
   * @param options - Build options.
   */
  constructor(values: Partial<TCreationAttributes> | Values = {}, options: BuildOptions = {}) {
    const { definition } = stateOf(this.constructor);
    this.isNewRecord = options.isNewRecord ?? true;
    this.dataValues = (this.isNewRecord ? initialValues(definition) : {}) as TAttributes;
    this._previousDataValues = {};
    const includes =
      options.include === undefined
        ? []
        : normalizeIncludes(this.constructor as ModelStatic<AnyModel>, options.include);
    const nested = new Set(includes.map((node) => node.as));
    const own = Object.fromEntries(
      Object.entries(values as Values).filter(([key]) => !nested.has(key)),
    );
    this.set(own, options.raw === true ? { raw: true } : {});
    includes.forEach((node) => {
      const value = (values as Values)[node.as];
      if (value !== undefined) {
        (this.dataValues as Values)[node.as] = buildNested(node, value);
      }
    });
    this.#includes = includes;
    if (!this.isNewRecord || options.raw === true) {
      this._previousDataValues = { ...this.dataValues };
      this.#changed = new Set();
    }
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
    return insertedFlags.get(this);
  }

  /**
   * For instances returned with `returningOld: true`: attribute values of the row before the
   * statement, or `null` when the row did not exist (inserted). `undefined` otherwise. PostgreSQL 18+.
   */
  get oldValues(): Readonly<Record<string, unknown>> | null | undefined {
    return oldValuesOf.get(this);
  }

  /** `Sequelize` instance the model belongs to. */
  get sequelize(): RuntimeOwner {
    return (this.constructor as typeof Model).sequelize;
  }

  /** Model name. */
  static get modelName(): string {
    return stateOf(this).definition.name;
  }

  /** Table name. */
  static get tableName(): string {
    return stateOf(this).definition.tableName;
  }

  /** Normalized attributes keyed by attribute name. */
  static get rawAttributes(): Readonly<Record<string, AttributeDefinition>> {
    return Object.fromEntries(stateOf(this).definition.attributes);
  }

  /** First primary key attribute name. */
  static get primaryKeyAttribute(): string | undefined {
    return stateOf(this).definition.primaryKeys[0];
  }

  /** All primary key attribute names. */
  static get primaryKeyAttributes(): readonly string[] {
    return stateOf(this).definition.primaryKeys;
  }

  /** Model options after defaults were applied. */
  static get options(): DefinitionOptions {
    return stateOf(this).definition.options;
  }

  /** `Sequelize` instance the model belongs to. */
  static get sequelize(): RuntimeOwner {
    return (
      sequelizes.get(this) ??
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
    const {
      sequelize,
      hooks,
      defaultScope,
      scopes,
      whereMergeStrategy,
      validate,
      validationSchema,
      ...definitionOptions
    } = options;
    const runtime = sequelize[runtimeKey];
    const definition = normalizeDefinition(
      this.name,
      attributes,
      definitionOptions,
      runtime.defaults,
    );
    states.set(
      this,
      initialState(
        definition,
        runtime,
        { className: this.name, attributes, options: definitionOptions, extra: {} },
        {
          hooks: hooksFromOption(hooks, hooksFromOption(runtime.defaults.hooks)),
          defaultScope,
          scopes,
          whereMergeStrategy,
          validate,
          schema: validationSchema,
        },
      ),
    );
    sequelizes.set(this, sequelize);
    defineAttributeAccessors(this.prototype, definition);
    runtime.register(definition.name, this);
    return this;
  }

  /** Associations of the model by alias (Sequelize v6 `Model.associations`). */
  static get associations(): Readonly<Record<string, Association>> {
    return Object.fromEntries(associationsOf(this));
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
    return defineBelongsTo(this, target, options);
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
    return defineHasOne(this, target, options);
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
    return defineHasMany(this, target, options);
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
    return defineBelongsToMany(this, target, options);
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
    const { definition, runtime } = stateOf(this);
    await syncModel(definition, runtime, runtime.queryInterface(), options);
    return this;
  }

  /**
   * Drops the table of this model and its enum types.
   *
   * @param options - `cascade` and query options.
   * @returns Resolves when done.
   */
  static async drop(options: DropOptions = {}): Promise<void> {
    const { definition, runtime } = stateOf(this);
    await dropModel(definition, runtime.queryInterface(), options);
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
    return subqueryExpression(() => {
      const { definition, runtime, scopes } = stateOf(this);
      const { as, ...findOptions } = options;
      const scoped = injectScope(
        activeScope(this),
        { ...findOptions },
        scopes.whereMergeStrategy,
      ) as FindOptions;
      const query = { ...scoped, where: withParanoid(definition, scoped.where, scoped.paranoid) };
      const includes = normalizeIncludes(this, query.include);
      const base = buildSelect(
        sourceDefinition(definition, query.source),
        {
          ...(includes.length === 0 ? query : { ...query, order: undefined }),
          ...cteSelectOptions(query),
        } as SelectOptions,
        runtime.inAsAnyThreshold,
        undefined,
        as,
      );
      return includes.length === 0 ? base : withIncludes(definition, base, includes, query);
    });
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
  static async insertFrom<M extends AnyModel>(
    this: ModelStatic<M>,
    source: Subquery,
    options: InsertFromOptions<Attributes<M>>,
  ): Promise<M[]> {
    const { definition, runtime } = stateOf(this);
    const onConflict =
      options.onConflict === undefined
        ? undefined
        : buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>);
    const node = {
      kind: 'insert' as const,
      table: tableOf(definition, onConflict === undefined ? undefined : definition.name),
      columns: options.columns.map((name) => definition.attributes.get(name)?.field ?? name),
      rows: [],
      select: source.build(),
      ...(onConflict === undefined ? {} : { onConflict }),
      returning: [...returningAll(definition), insertedFlagColumn()],
    };
    const old = await returningOld(runtime, options);
    const result = await runtime.execute(
      compile(old ? withReturningOld(definition, node) : node),
      options,
    );
    return result.rows.map((row) => {
      const instance = fromWrittenRow(this, row, old);
      insertedFlags.set(instance, row[INSERTED_FLAG] === true);
      return instance;
    });
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
  static async merge<M extends AnyModel>(
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
    const { definition, runtime } = stateOf(this);
    const version = await runtime.serverVersion();
    if (version < 150000) {
      throw new Error('merge requires PostgreSQL 15 or newer');
    }
    if (
      (options.returning === true || options.whenNotMatchedBySource !== undefined) &&
      version < 170000
    ) {
      throw new Error(
        'merge with returning or whenNotMatchedBySource requires PostgreSQL 17 or newer',
      );
    }
    if (options.returningOld === true && options.returning !== true) {
      throw new Error('merge: returningOld requires returning: true');
    }
    const old = await returningOld(runtime, options);
    const node = buildMerge(
      definition,
      options as MergeOptions<unknown>,
      options.returning === true,
    );
    const result = await runtime.execute(
      compile(old ? withReturningOld(definition, node) : node),
      options,
    );
    return {
      rowCount: result.rowCount,
      rows: result.rows.map((row) => ({
        action: String(row[MERGE_ACTION]) as MergeActionName,
        instance: fromWrittenRow(this, row, old),
      })),
    };
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
  static async *findEach<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
    cursor: Readonly<{ batchSize?: number }> = {},
  ): AsyncGenerator<M, void, undefined> {
    const { definition, runtime, scopes } = stateOf(this);
    const scoped = injectScope(
      activeScope(this),
      { ...options },
      scopes.whereMergeStrategy,
    ) as FindOptions;
    const includes = normalizeIncludes(this, scoped.include);
    if (includes.some((node) => !node.separate)) {
      throw new Error('findEach does not support joined includes');
    }
    const batchSize = cursor.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('findEach: batchSize must be a positive integer');
    }
    const query = { ...scoped, where: withParanoid(definition, scoped.where, scoped.paranoid) };
    const compiled = compile(
      buildSelect(definition, query as SelectOptions, runtime.inAsAnyThreshold),
    );
    const own =
      options.transaction === undefined || options.transaction === null
        ? await runtime.beginTransaction()
        : undefined;
    const transaction = own ?? (options.transaction as Transaction);
    const name = quoteIdent(`pgz_cursor_${randomUUID().replaceAll('-', '')}`);
    const run = (text: string, values: readonly unknown[] = []) =>
      runtime.execute({ text, values }, { ...pickQueryOptions(options), transaction });
    let failed = false;
    try {
      await run(`DECLARE ${name} NO SCROLL CURSOR FOR ${compiled.text}`, compiled.values);
      for (;;) {
        const batch = await run(`FETCH ${batchSize} FROM ${name}`);
        if (batch.rows.length === 0) {
          break;
        }
        const instances = batch.rows.map((row) => fromRow(this, row));
        if (includes.length > 0) {
          await loadSeparate(instances, includes, { transaction });
        }
        yield* instances;
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (own === undefined) {
        await run(`CLOSE ${name}`).catch(() => undefined);
      } else if (failed) {
        await own.rollback().catch(() => undefined);
      } else {
        await own.commit();
      }
    }
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
  static async copyFrom<M extends AnyModel>(
    this: ModelStatic<M>,
    rows: Iterable<CreationAttributes<M>> | AsyncIterable<CreationAttributes<M>>,
    options: CopyFromOptions<Attributes<M>> = {},
  ): Promise<number> {
    const { definition, runtime } = stateOf(this);
    const listed =
      options.columns ??
      (Array.isArray(rows) && rows.length > 0
        ? Object.keys(rows[0] as Values).filter((name) => definition.attributes.has(name))
        : undefined);
    if (listed === undefined || listed.length === 0) {
      throw new Error('copyFrom: columns are required for non-array sources');
    }
    const stamps = [definition.createdAt, definition.updatedAt].filter(
      (name): name is string => name !== undefined && !listed.includes(name as never),
    );
    const columns = [...(listed as readonly string[]), ...stamps];
    columns.forEach((name) => {
      if (!definition.attributes.has(name)) {
        throw new Error(`copyFrom: unknown attribute "${name}" of model ${definition.name}`);
      }
    });
    const attributes = columns.map(
      (name) => definition.attributes.get(name) as AttributeDefinition,
    );
    const table = [definition.schema, definition.tableName]
      .filter((part): part is string => part !== undefined)
      .map(quoteIdent)
      .join('.');
    const text = `COPY ${table} (${attributes.map((attribute) => quoteIdent(attribute.field)).join(', ')}) FROM STDIN`;
    const now = new Date();
    async function* lines(): AsyncGenerator<string> {
      for await (const row of rows as AsyncIterable<Values>) {
        yield encodeCopyRow(
          attributes.map((attribute) => {
            const value = stamps.includes(attribute.fieldName) ? now : row[attribute.fieldName];
            return value === undefined || value === null || attribute.type.serialize === undefined
              ? value
              : attribute.type.serialize(value);
          }),
        );
      }
    }
    return runtime.copyFrom(text, lines(), options);
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
    const { definition, runtime, scopes } = stateOf(this);
    const scoped = injectScope(
      activeScope(this),
      { ...options },
      scopes.whereMergeStrategy,
    ) as FindOptions;
    const query = { ...scoped, where: withParanoid(definition, scoped.where, scoped.paranoid) };
    const includes = normalizeIncludes(this, query.include);
    const base = buildSelect(
      sourceDefinition(definition, query.source),
      {
        ...(includes.length === 0 ? query : { ...query, order: undefined }),
        ...cteSelectOptions(query),
      } as SelectOptions,
      runtime.inAsAnyThreshold,
    );
    const select = includes.length === 0 ? base : withIncludes(definition, base, includes, query);
    return runtime.copyTo(
      `COPY (${inlineValues(compile(select))}) TO STDOUT${copyFormatSql(options)}`,
      options,
      'read',
    );
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
    updateState(this, (state) => ({
      ...state,
      hooks:
        typeof nameOrFn === 'string'
          ? addHook(state.hooks, type, fn ?? missingHook(), nameOrFn)
          : addHook(state.hooks, type, nameOrFn),
    }));
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
    updateState(this, (state) => ({ ...state, hooks: removeHook(state.hooks, type, nameOrFn) }));
    return this;
  }

  /**
   * Checks whether hooks of the type are registered on the model.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   */
  static hasHook(type: HookType): boolean {
    return hasHook(stateOf(this).hooks, type);
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
    return runModelHooks(this, type, ...args);
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
    resolveScopes(stateOf(this).scopes, flat);
    selectScopes(Scoped, flat);
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
    const { scopes } = stateOf(this);
    const exists =
      name === 'defaultScope'
        ? Object.keys(scopes.defaultScope).length > 0
        : scopes.scopes.has(name);
    if (exists && options.override !== true) {
      throw new Error(
        `The scope ${name} already exists. Pass { override: true } as options to silence this error`,
      );
    }
    updateState(this, (state) => ({
      ...state,
      scopes:
        name === 'defaultScope'
          ? { ...state.scopes, defaultScope: scope as ScopeOptions }
          : { ...state.scopes, scopes: new Map([...state.scopes.scopes, [name, scope]]) },
    }));
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
    const { definition } = stateOf(this);
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
  static async create<M extends AnyModel>(
    this: ModelStatic<M>,
    values?: CreationAttributes<M>,
    options: CreateOptions<Attributes<M>> = {},
  ): Promise<M> {
    const instance = new this(
      values as Values,
      options.include === undefined ? {} : { include: options.include },
    );
    if (options.onConflict === undefined) {
      return instance.save(options as SaveOptions);
    }
    const { definition } = stateOf(this);
    const opts: MutableOptions = { hooks: true, validate: true, ...options };
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true });
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeCreate', instance, opts);
    }
    const row = withTimestamps(
      definition,
      instance.dataValues as Values,
      new Date(),
      true,
      opts['silent'] === true,
    );
    const [inserted] = await insertWithConflict(
      this,
      [pickFields(row, options.fields)],
      buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>),
      options,
    );
    if (inserted === undefined) {
      insertedFlags.set(instance, false);
      return instance;
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterCreate', inserted, opts);
    }
    return inserted;
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
  static async insert<M extends AnyModel>(
    this: ModelStatic<M>,
    values: CreationAttributes<M> | readonly CreationAttributes<M>[],
    options: InsertOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    const { definition } = stateOf(this);
    const now = new Date();
    const records: readonly Values[] = Array.isArray(values) ? values : [values as Values];
    if (records.length === 0) {
      return [];
    }
    const opts: MutableOptions = { hooks: true, validate: false, ...options };
    const instances = records.map((record) => new this(record));
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeBulkCreate', instances, opts);
    }
    if (opts['validate'] === true) {
      await validateAll(instances, false);
    }
    const rows = instances.map((instance) =>
      pickFields(
        withTimestamps(definition, instance.dataValues as Values, now, true, false),
        options.fields,
      ),
    );
    const onConflict =
      options.onConflict === undefined
        ? undefined
        : buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>);
    const inserted = await insertWithConflict(this, rows, onConflict, options);
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterBulkCreate', inserted, opts);
    }
    return inserted;
  }

  /**
   * Inserts a row or updates it when it conflicts with a unique key (Sequelize v6 `upsert`).
   *
   * @param values - Attribute values.
   * @param options - Upsert options.
   * @returns `[instance, null]` like Sequelize v6, or `[instance, created]` with `onConflict`.
   */
  static async upsert<M extends AnyModel>(
    this: ModelStatic<M>,
    values: CreationAttributes<M>,
    options: UpsertOptions<Attributes<M>> = {},
  ): Promise<[M, boolean | null]> {
    const { definition, runtime } = stateOf(this);
    const opts: MutableOptions = { hooks: true, validate: true, returning: true, ...options };
    const instance = new this(values as Values);
    const now = new Date();
    const provided = Object.keys(values as Values).filter((name) =>
      definition.attributes.has(name),
    );
    const updatable =
      options.fields === undefined
        ? provided
        : provided.filter((name) => options.fields?.includes(name as never));
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true, fields: updatable });
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeUpsert', values, opts);
    }
    const insertValues = withoutGeneratedKey(definition, values as Values, {
      ...withTimestamps(definition, instance.dataValues as Values, now, true, false),
      ...(definition.updatedAt !== undefined &&
      (values as Values)[definition.updatedAt] !== undefined &&
      (values as Values)[definition.updatedAt] !== null
        ? { [definition.updatedAt]: instance.dataValues[definition.updatedAt] }
        : {}),
    });
    const onConflict =
      options.onConflict === undefined
        ? v6UpsertConflict(definition, insertValues, updatable, options.conflictFields)
        : buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>);
    const insert = buildInsert(definition, [insertValues], {
      onConflict,
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      returning: [...returningAll(definition), insertedFlagColumn()],
    });
    const result = await runtime.execute(compile(insert), options);
    const row = result.rows[0];
    const flag = row?.[INSERTED_FLAG];
    instance.#refresh(definition, row === undefined ? undefined : withoutFlag(row));
    if (options.onConflict !== undefined) {
      insertedFlags.set(instance, flag === true);
    }
    const upserted: [M, boolean | null] = [
      instance,
      options.onConflict === undefined ? null : flag === true,
    ];
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterUpsert', upserted, opts);
    }
    return upserted;
  }

  /**
   * Inserts many rows with one statement.
   *
   * @param records - Attribute values per row.
   * @param options - Options.
   * @returns Instances with values returned by the database.
   */
  static async bulkCreate<M extends AnyModel>(
    this: ModelStatic<M>,
    records: readonly CreationAttributes<M>[],
    options: BulkCreateOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    const { definition, runtime } = stateOf(this);
    if (
      options.onConflict !== undefined &&
      V6_CONFLICT_OPTIONS.some((name) => options[name] !== undefined)
    ) {
      throw new Error(`onConflict cannot be combined with ${V6_CONFLICT_OPTIONS.join(', ')}`);
    }
    const opts: MutableOptions = {
      hooks: true,
      validate: false,
      individualHooks: options.include !== undefined,
      ...options,
    };
    const instances = records.map(
      (values) =>
        new this(
          values as Values,
          options.include === undefined ? {} : { include: options.include },
        ),
    );
    if (instances.length === 0) {
      return [];
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeBulkCreate', instances, opts);
    }
    if (opts['validate'] === true) {
      await validateAll(instances, opts['individualHooks'] === true);
    }
    const created = await (async (): Promise<M[]> => {
      if (opts['individualHooks'] === true) {
        const {
          fields: _fields,
          individualHooks: _individual,
          ignoreDuplicates: _ignore,
          include: _include,
          ...saveOptions
        } = opts;
        await instances.reduce<Promise<unknown>>(
          (previous, instance) =>
            previous.then(() => instance.save({ ...saveOptions, validate: false, hooks: true })),
          Promise.resolve(),
        );
        return instances;
      }
      const now = new Date();
      const rows = instances.map((instance) =>
        pickFields(
          withTimestamps(
            definition,
            instance.dataValues as Values,
            now,
            true,
            opts['silent'] === true,
          ),
          options.fields,
        ),
      );
      if (options.onConflict !== undefined) {
        return insertWithConflict(
          this,
          rows,
          buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>),
          options,
        );
      }
      const insert = buildInsert(definition, rows, {
        returning: options.returning !== false,
        ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
        ...v6BulkConflict(definition, options as BulkCreateOptions),
      });
      const result = await runtime.execute(compile(insert), options);
      const returned =
        options.ignoreDuplicates === true
          ? insertedRowsOf(definition, rows, result.rows)
          : result.rows;
      instances.forEach((instance, index) => instance.#refresh(definition, returned[index]));
      return instances;
    })();
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterBulkCreate', created, opts);
    }
    return created;
  }

  /**
   * Finds all rows matching the options (default scope and paranoid filter applied).
   *
   * @param options - Query options.
   * @returns Instances, or plain objects with `raw: true`.
   */
  static async findAll<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    const { definition, runtime, scopes } = stateOf(this);
    const opts: MutableOptions = {
      hooks: true,
      ...injectScope(activeScope(this), { ...options }, scopes.whereMergeStrategy),
    };
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeFind', opts);
      await runModelHooks(this, 'beforeFindAfterExpandIncludeAll', opts);
      await runModelHooks(this, 'beforeFindAfterOptions', opts);
    }
    const query = {
      ...(opts as FindOptions),
      where: withParanoid(definition, opts['where'], opts['paranoid'] as boolean | undefined),
    };
    const includes = normalizeIncludes(this, opts['include'] as IncludeOption | undefined);
    const base = buildSelect(
      sourceDefinition(definition, (query as FindOptions).source),
      {
        ...(includes.length === 0 ? query : { ...query, order: undefined }),
        ...cteSelectOptions(query as FindOptions),
      } as SelectOptions,
      runtime.inAsAnyThreshold,
    );
    const select =
      includes.length === 0 ? base : withIncludes(definition, base, includes, query as FindOptions);
    const result = await runtime.execute(compile(select), query, 'read');
    const parseMain = (row: Readonly<Record<string, unknown>>) => parseRow(definition, row);
    const found =
      opts['raw'] === true
        ? (result.rows
            .map((row) =>
              includes.length === 0 ? parseMain(row) : parseRawRow(includes, row, parseMain),
            )
            .map((row) => (opts['nest'] === true ? nestRow(row as Values) : row)) as unknown as M[])
        : includes.length === 0
          ? result.rows.map((row) => fromRow(this, row))
          : (assembleInstances(
              this,
              includes,
              result.rows,
              parseMain,
              (model, values) => new model(values, { isNewRecord: false, raw: true }),
            ) as M[]);
    if (opts['raw'] !== true && includes.length > 0) {
      await loadSeparate(found, includes, query);
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterFind', found, opts);
    }
    return found;
  }

  /**
   * Finds the first row matching the options, throwing when none is found.
   *
   * @param options - Query options with `rejectOnEmpty`.
   * @returns Instance.
   * @throws EmptyResultError (or the given error) when nothing is found.
   */
  static async findOne<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> & Readonly<{ rejectOnEmpty: true | Error }>,
  ): Promise<M>;
  /**
   * Finds the first row matching the options.
   *
   * @param options - Query options.
   * @returns Instance or `null`.
   */
  static async findOne<M extends AnyModel>(
    this: ModelStatic<M>,
    options?: FindOptions<Attributes<M>>,
  ): Promise<M | null>;
  static async findOne<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<M | null> {
    const [first] = await this.findAll({ ...options, limit: options.limit ?? 1 });
    if (
      first === undefined &&
      options.rejectOnEmpty !== undefined &&
      options.rejectOnEmpty !== false
    ) {
      throw options.rejectOnEmpty instanceof Error ? options.rejectOnEmpty : new EmptyResultError();
    }
    return first ?? null;
  }

  /**
   * Finds a row by primary key.
   *
   * @param key - Primary key value.
   * @param options - Query options.
   * @returns Instance or `null`.
   */
  static async findByPk<M extends AnyModel>(
    this: ModelStatic<M>,
    key: unknown,
    options: Omit<FindOptions<Attributes<M>>, 'where'> = {},
  ): Promise<M | null> {
    if (key === null || key === undefined) {
      return null;
    }
    const name = stateOf(this).definition.primaryKeys[0] ?? 'id';
    return this.findOne({ ...options, where: { [name]: key } as WhereOptions<Attributes<M>> });
  }

  /**
   * Counts rows (default scope and paranoid filter applied).
   *
   * @param options - Count options.
   * @returns Count, or `{ count, ...groups }[]` with `group`.
   */
  static async count<M extends AnyModel>(
    this: ModelStatic<M>,
    options: CountOptions<Attributes<M>> = {},
  ): Promise<number> {
    const { definition, runtime, scopes } = stateOf(this);
    const opts: MutableOptions = {
      hooks: true,
      ...injectScope(activeScope(this), { ...options }, scopes.whereMergeStrategy),
    };
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeCount', opts);
    }
    const query = {
      ...(opts as CountOptions),
      where: withParanoid(definition, opts['where'], opts['paranoid'] as boolean | undefined),
    };
    const includes = normalizeIncludes(this, opts['include'] as IncludeOption | undefined);
    const countQuery = (
      includes.length === 0 || query.col !== undefined
        ? query
        : {
            ...query,
            col: `${definition.name}.${definition.attributes.get(definition.primaryKeys[0] ?? 'id')?.field ?? 'id'}`,
          }
    ) as SelectOptions & CountOptions;
    const counted = buildCount(
      sourceDefinition(definition, query.source),
      { ...countQuery, ...cteSelectOptions(query) },
      runtime.inAsAnyThreshold,
    );
    const select =
      includes.length === 0 ? counted : { ...counted, joins: countJoins(definition, includes) };
    const result = await runtime.execute(compile(select), query, 'read');
    if (query.group !== undefined) {
      return result.rows.map((row) => ({
        ...parseRow(definition, row),
        count: Number(row['count']),
      })) as unknown as number;
    }
    return Number(result.rows[0]?.['count'] ?? 0);
  }

  /**
   * Runs `findAll` and `count` with the same filter.
   *
   * @param options - Query options.
   * @returns Total count and the current page of rows.
   */
  static async findAndCountAll<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<FindAndCountResult<M>> {
    const [count, rows] = await Promise.all([
      this.count({
        ...(options.where === undefined ? {} : { where: options.where }),
        ...(options.include === undefined ? {} : { include: options.include }),
        ...(options.paranoid === undefined ? {} : { paranoid: options.paranoid }),
        ...pickQueryOptions(options),
      }),
      this.findAll(options),
    ]);
    return { count, rows };
  }

  /**
   * Runs an aggregate function over a column.
   *
   * @param field - Attribute name or `'*'`.
   * @param aggregateFunction - SQL aggregate function name, e.g. `'max'`.
   * @param options - Options.
   * @returns Aggregated value.
   */
  static async aggregate<M extends AnyModel, T = unknown>(
    this: ModelStatic<M>,
    field: keyof Attributes<M> | '*',
    aggregateFunction: string,
    options: AggregateOptions<Attributes<M>> = {},
  ): Promise<T> {
    const { definition, runtime, scopes } = stateOf(this);
    const name = String(field);
    const scoped = injectScope(activeScope(this), { ...options }, scopes.whereMergeStrategy);
    const query = { ...scoped, where: withParanoid(definition, scoped.where, scoped.paranoid) };
    const result = await runtime.execute(
      compile(
        buildAggregate(
          definition,
          name,
          aggregateFunction,
          query as SelectOptions,
          runtime.inAsAnyThreshold,
        ),
      ),
      query,
      'read',
    );
    const attribute = definition.attributes.get(name);
    if (options.plain === false) {
      return result.rows.map((row) => ({
        ...row,
        [aggregateFunction]: parseAggregate(attribute, aggregateFunction, row[aggregateFunction]),
      })) as T;
    }
    return parseAggregate(attribute, aggregateFunction, result.rows[0]?.[aggregateFunction]) as T;
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
  static async update<M extends AnyModel>(
    this: ModelStatic<M>,
    values: Partial<Attributes<M>>,
    options: UpdateOptions<Attributes<M>>,
  ): Promise<[affectedCount: number, affectedRows?: M[]]> {
    const { definition, runtime, scopes } = stateOf(this);
    const opts: MutableOptions = {
      validate: true,
      hooks: true,
      individualHooks: false,
      ...injectScope(activeScope(this), { ...options }, scopes.whereMergeStrategy),
      attributes: { ...(values as Values) },
    };
    if (opts['validate'] === true) {
      const probe = new this(values as Values, { isNewRecord: false });
      await probe.validate({
        hooks: opts['hooks'] === true,
        skip: [...definition.attributes.keys()].filter((name) => !(name in (values as Values))),
      });
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeBulkUpdate', opts);
    }
    const where = withParanoid(definition, opts['where'], opts['paranoid'] as boolean | undefined);
    const individual = opts['individualHooks'] === true;
    const targets = individual
      ? await this.findAll({ where: where as never, ...pickQueryOptions(options), paranoid: false })
      : [];
    const attributes = opts['attributes'] as Values;
    if (individual) {
      await targets.reduce<Promise<unknown>>(
        (previous, instance) =>
          previous.then(() => {
            instance.set(attributes);
            return runModelHooks(this, 'beforeUpdate', instance, opts);
          }),
        Promise.resolve(),
      );
    }
    const changes = withTimestamps(
      definition,
      pickFields(attributes, options.fields),
      new Date(),
      false,
      opts['silent'] === true,
    );
    if (individual && options.from !== undefined) {
      throw new Error('update: individualHooks cannot be combined with from');
    }
    if (options.returningOld === true && options.returning !== true) {
      throw new Error('update: returningOld requires returning: true');
    }
    const old = await returningOld(runtime, options);
    const from = joinSources(options.from);
    const node = buildUpdate(
      definition,
      setItems(
        definition,
        changes,
        whereContext(definition, from.length === 0 ? undefined : definition.name),
      ),
      where,
      {
        ...(from.length === 0 ? {} : { from }),
        ...(options.returning === true || individual ? { returning: true } : {}),
        ...(runtime.inAsAnyThreshold === undefined
          ? {}
          : { inAsAnyThreshold: runtime.inAsAnyThreshold }),
      },
    );
    const result = await runtime.execute(
      compile(old ? withReturningOld(definition, node) : node),
      options,
    );
    const updated = result.rows.map((row) => fromWrittenRow(this, row, old));
    if (individual) {
      await updated.reduce<Promise<unknown>>(
        (previous, instance) =>
          previous.then(() => runModelHooks(this, 'afterUpdate', instance, opts)),
        Promise.resolve(),
      );
    }
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterBulkUpdate', opts);
    }
    return options.returning === true ? [result.rowCount, updated] : [result.rowCount];
  }

  /**
   * Deletes rows matching `where`.
   *
   * @param options - Destroy options.
   * @returns Number of deleted rows, or deleted instances with `returning: true`.
   */
  static async destroy<M extends AnyModel>(
    this: ModelStatic<M>,
    options: DestroyOptions<Attributes<M>> & Readonly<{ returning: true }>,
  ): Promise<M[]>;
  /**
   * Deletes rows matching `where`.
   *
   * @param options - Destroy options.
   * @returns Number of deleted rows.
   */
  static async destroy<M extends AnyModel>(
    this: ModelStatic<M>,
    options?: DestroyOptions<Attributes<M>>,
  ): Promise<number>;
  static async destroy<M extends AnyModel>(
    this: ModelStatic<M>,
    options: DestroyOptions<Attributes<M>> = {},
  ): Promise<number | M[]> {
    const { definition, runtime, scopes } = stateOf(this);
    const opts: MutableOptions = {
      hooks: true,
      individualHooks: false,
      force: false,
      ...injectScope(activeScope(this), { ...options }, scopes.whereMergeStrategy),
    };
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeBulkDestroy', opts);
    }
    const soft = definition.deletedAt !== undefined && opts['force'] !== true;
    const where = soft ? withParanoid(definition, opts['where'], true) : opts['where'];
    const individual = opts['individualHooks'] === true;
    const targets = individual
      ? await this.findAll({ where: where as never, ...pickQueryOptions(options), paranoid: false })
      : [];
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => runModelHooks(this, 'beforeDestroy', instance, opts)),
      Promise.resolve(),
    );
    const deleted = await (async (): Promise<number | M[]> => {
      if (options.truncate === true) {
        await (this as unknown as typeof Model).truncate(options);
        return 0;
      }
      const inAsAny =
        runtime.inAsAnyThreshold === undefined
          ? {}
          : { inAsAnyThreshold: runtime.inAsAnyThreshold };
      const node =
        soft && definition.deletedAt !== undefined
          ? buildUpdate(
              definition,
              setItems(definition, { [definition.deletedAt]: new Date() }),
              where,
              {
                ...(options.returning === true ? { returning: true } : {}),
                ...inAsAny,
              },
            )
          : buildDelete(definition, where, {
              ...(options.using === undefined ? {} : { using: joinSources(options.using) }),
              ...(options.returning === true ? { returning: true } : {}),
              ...(options.limit === undefined ? {} : { limit: options.limit }),
              ...inAsAny,
            });
      const result = await runtime.execute(compile(node), options);
      return options.returning === true
        ? result.rows.map((row) => fromRow(this, row))
        : result.rowCount;
    })();
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => runModelHooks(this, 'afterDestroy', instance, opts)),
      Promise.resolve(),
    );
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterBulkDestroy', opts);
    }
    return deleted;
  }

  /**
   * Restores soft-deleted rows of a paranoid model (`deletedAt = NULL`).
   *
   * @param options - Rows to restore and hook options.
   * @returns Resolves when done.
   * @throws Error when the model is not paranoid.
   */
  static async restore<M extends AnyModel>(
    this: ModelStatic<M>,
    options: RestoreOptions<Attributes<M>> = {},
  ): Promise<void> {
    const { definition, runtime } = stateOf(this);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const opts: MutableOptions = { hooks: true, individualHooks: false, ...options };
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'beforeBulkRestore', opts);
    }
    const individual = opts['individualHooks'] === true;
    const targets = individual
      ? await this.findAll({
          where: opts['where'] as never,
          ...pickQueryOptions(options),
          paranoid: false,
        })
      : [];
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => runModelHooks(this, 'beforeRestore', instance, opts)),
      Promise.resolve(),
    );
    const node = buildUpdate(
      definition,
      setItems(definition, { [definition.deletedAt]: null }),
      opts['where'],
      runtime.inAsAnyThreshold === undefined ? {} : { inAsAnyThreshold: runtime.inAsAnyThreshold },
    );
    await runtime.execute(compile(node), options);
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => runModelHooks(this, 'afterRestore', instance, opts)),
      Promise.resolve(),
    );
    if (opts['hooks'] === true) {
      await runModelHooks(this, 'afterBulkRestore', opts);
    }
  }

  /**
   * Empties the table.
   *
   * @param options - `cascade`, `restartIdentity` and query options.
   * @returns Resolves when done.
   */
  static async truncate(
    options: QueryOptionsBase & Readonly<{ cascade?: boolean; restartIdentity?: boolean }> = {},
  ): Promise<void> {
    const { definition, runtime } = stateOf(this);
    await runtime.execute(
      compile({
        kind: 'truncate',
        table: {
          name: definition.tableName,
          ...(definition.schema === undefined ? {} : { schema: definition.schema }),
        },
        ...(options.cascade === true ? { cascade: true } : {}),
        ...(options.restartIdentity === true ? { restartIdentity: true } : {}),
      }),
      options,
    );
  }

  /**
   * Increments attributes of rows matching `where` (`SET x = x + by`).
   *
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param options - Increment options.
   * @returns Updated instances.
   */
  static async increment<M extends AnyModel>(
    this: ModelStatic<M>,
    fields: AttributeAmounts<Attributes<M>>,
    options: IncrementOptions<Attributes<M>> = {},
  ): Promise<[affectedRows: M[], affectedCount: number]> {
    return changeBy(
      this,
      fields as AttributeAmounts<Values>,
      options as IncrementOptions,
      1,
    ) as Promise<[M[], number]>;
  }

  /**
   * Decrements attributes of rows matching `where` (`SET x = x - by`).
   *
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param options - Decrement options.
   * @returns Updated instances.
   */
  static async decrement<M extends AnyModel>(
    this: ModelStatic<M>,
    fields: AttributeAmounts<Attributes<M>>,
    options: IncrementOptions<Attributes<M>> = {},
  ): Promise<[affectedRows: M[], affectedCount: number]> {
    return changeBy(
      this,
      fields as AttributeAmounts<Values>,
      options as IncrementOptions,
      -1,
    ) as Promise<[M[], number]>;
  }

  /**
   * Finds a row or creates it inside a transaction.
   *
   * @param options - `where` to search, `defaults` to add on creation.
   * @returns `[instance, created]`.
   */
  static async findOrCreate<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOrCreateOptions<Attributes<M>>,
  ): Promise<[M, boolean]> {
    const { runtime } = stateOf(this);
    const found = await this.findOne(options);
    if (found !== null) {
      return [found, false];
    }
    return runtime.transaction(async (transaction) => {
      const values = {
        ...plainWhereValues(options.where),
        ...options.defaults,
      } as CreationAttributes<M>;
      try {
        return [await this.create(values, { transaction, ...pickQueryOptions(options) }), true];
      } catch (error) {
        const existing = await this.findOne({
          ...options,
          transaction: options.transaction ?? null,
        });
        if (existing === null) {
          throw error;
        }
        return [existing, false];
      }
    }, options.transaction);
  }

  /**
   * Finds a row or builds (without saving) a new instance.
   *
   * @param options - `where` to search, `defaults` to add when building.
   * @returns `[instance, built]`.
   */
  static async findOrBuild<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOrCreateOptions<Attributes<M>>,
  ): Promise<[M, boolean]> {
    const found = await this.findOne(options);
    return found === null
      ? [this.build({ ...plainWhereValues(options.where), ...options.defaults } as Values), true]
      : [found, false];
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
    if (typeof keyOrOptions === 'string') {
      const getter = stateOf(this.constructor).definition.attributes.get(keyOrOptions)?.get;
      return getter !== undefined && options.raw !== true
        ? (getter as (this: unknown) => unknown).call(this)
        : (this.dataValues as Values)[keyOrOptions];
    }
    const raw = typeof keyOrOptions === 'object' && keyOrOptions.raw === true;
    const plain = typeof keyOrOptions === 'object' && keyOrOptions.plain === true;
    const toPlain = (value: unknown): unknown =>
      !plain
        ? value
        : value instanceof Model
          ? value.get({ plain: true })
          : Array.isArray(value) && value.some((item) => item instanceof Model)
            ? value.map(toPlain)
            : value;
    return Object.fromEntries(
      Object.keys(this.dataValues).map((key) => [
        key,
        toPlain(raw ? (this.dataValues as Values)[key] : this.get(key as keyof TAttributes)),
      ]),
    );
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
    if (typeof keyOrValues === 'object') {
      const options = (valueOrOptions ?? {}) as Readonly<{ raw?: boolean }>;
      Object.entries(keyOrValues).forEach(([key, value]) =>
        this.set(key as keyof TAttributes, value as never, options),
      );
      return this;
    }
    const key = String(keyOrValues);
    const options = maybeOptions ?? {};
    const attribute = stateOf(this.constructor).definition.attributes.get(key);
    if (options.raw === true) {
      (this.dataValues as Values)[key] = valueOrOptions;
      return this;
    }
    if (attribute === undefined) {
      return this;
    }
    if (attribute.set !== undefined) {
      (attribute.set as (this: unknown, value: unknown) => void).call(this, valueOrOptions);
      return this;
    }
    return this.setDataValue(
      key as keyof TAttributes,
      valueOrOptions as TAttributes[keyof TAttributes],
    );
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
    const name = String(key);
    if (!isEqualValue(this._previousDataValues[key], value) || isExpression(value)) {
      this.#changed = new Set([...this.#changed, name]);
    } else if (this.#changed.has(name)) {
      this.#changed = new Set([...this.#changed].filter((item) => item !== name));
    }
    this.dataValues[key] = value;
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
    if (key === undefined) {
      return this.#changed.size === 0
        ? false
        : ([...this.#changed] as (keyof TAttributes & string)[]);
    }
    if (value === undefined) {
      return this.#changed.has(key);
    }
    this.#changed = value
      ? new Set([...this.#changed, key])
      : new Set([...this.#changed].filter((item) => item !== key));
    return undefined;
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
    if (key !== undefined) {
      return this._previousDataValues[key];
    }
    return Object.fromEntries(
      [...this.#changed].map((name) => [name, (this._previousDataValues as Values)[name]]),
    ) as Partial<TAttributes>;
  }

  /**
   * Inserts the instance if new, otherwise updates its changed attributes.
   *
   * @param options - Save options.
   * @returns This instance with values returned by the database.
   */
  async save(options: SaveOptions<TAttributes> = {}): Promise<this> {
    const model = this.constructor as typeof Model;
    const { definition, runtime } = stateOf(model);
    const opts: MutableOptions = { hooks: true, validate: true, ...options };
    const isNew = this.isNewRecord;
    const attributes = [...definition.attributes.keys()];
    const changedAttributes = (): readonly string[] =>
      [...this.#changed].filter((name) => definition.attributes.has(name));
    const explicitFields = options.fields as readonly string[] | undefined;
    const fields = explicitFields ?? (isNew ? attributes : changedAttributes());
    if (!isNew && fields.length === 0) {
      return this;
    }
    if (opts['validate'] === true) {
      await this.validate({ hooks: opts['hooks'] === true, fields });
    }
    const hookFields = await (async (): Promise<readonly string[]> => {
      if (opts['hooks'] !== true) {
        return fields;
      }
      const before = changedAttributes();
      await runModelHooks(model, isNew ? 'beforeCreate' : 'beforeUpdate', this, opts);
      const added =
        explicitFields === undefined && !isNew
          ? changedAttributes().filter((name) => !before.includes(name))
          : [];
      if (explicitFields === undefined && !isNew && opts['validate'] === true) {
        await this.validate({
          hooks: opts['hooks'] === true,
          skip: attributes.filter((name) => !added.includes(name)),
        });
      }
      return [...fields, ...added];
    })();
    const now = new Date();
    if (isNew) {
      await saveBelongsTo(this, this.#includes, options);
      const values = pickFields(
        withTimestamps(definition, this.dataValues as Values, now, true, opts['silent'] === true),
        explicitFields,
      );
      const result = await runtime.execute(
        compile(
          buildInsert(definition, [values], {
            returning: true,
            ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
          }),
        ),
        options,
      );
      this.#refresh(definition, result.rows[0]);
      await saveChildren(this, this.#includes, options);
    } else {
      const version = definition.version;
      const current = this.dataValues as Values;
      const changes = withTimestamps(
        definition,
        Object.fromEntries(
          hookFields.filter((name) => name !== version).map((name) => [name, current[name]]),
        ),
        now,
        false,
        opts['silent'] === true,
      );
      const previousVersion =
        version === undefined ? undefined : (this._previousDataValues as Values)[version];
      const where = {
        ...primaryKeyWhere(definition, this._previousDataValues as Values),
        ...(version === undefined ? {} : { [version]: previousVersion }),
      };
      const set =
        version === undefined
          ? changes
          : { ...changes, [version]: Number(previousVersion ?? 0) + 1 };
      const result = await runtime.execute(
        compile(buildUpdate(definition, setItems(definition, set), where, { returning: true })),
        options,
      );
      if (version !== undefined && result.rowCount === 0) {
        throw new OptimisticLockError({ modelName: definition.name, values: set, where });
      }
      this.#refresh(definition, result.rows[0]);
    }
    if (opts['hooks'] === true) {
      await runModelHooks(model, isNew ? 'afterCreate' : 'afterUpdate', this, opts);
    }
    return this;
  }

  /**
   * Validates the instance (Sequelize v6 `instance.validate()`).
   *
   * @param options - `hooks`, `skip`, `fields`.
   * @returns Resolves when valid.
   * @throws ValidationError with all failures.
   */
  async validate(options: ValidateOptions = {}): Promise<void> {
    await validateWithHooks(this, options);
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
  async reload(options: QueryOptionsBase = {}): Promise<this> {
    const { definition, runtime } = stateOf(this.constructor);
    const result = await runtime.execute(
      compile(
        buildSelect(definition, {
          where: primaryKeyWhere(definition, this.dataValues as Values),
          limit: 1,
        }),
      ),
      options,
    );
    if (result.rows[0] === undefined) {
      throw new InstanceError(
        'Instance could not be reloaded because it does not exist anymore (find call returned null)',
      );
    }
    return this.#refresh(definition, result.rows[0]);
  }

  /**
   * Deletes the row of this instance.
   *
   * @param options - Query options.
   * @returns Resolves when deleted.
   */
  async destroy(options: InstanceDestroyOptions = {}): Promise<void> {
    const model = this.constructor as typeof Model;
    const { definition, runtime } = stateOf(model);
    const opts: MutableOptions = { hooks: true, force: false, ...options };
    if (opts['hooks'] === true) {
      await runModelHooks(model, 'beforeDestroy', this, opts);
    }
    if (definition.deletedAt !== undefined && opts['force'] !== true) {
      this.setDataValue(
        definition.deletedAt as keyof TAttributes,
        new Date() as TAttributes[keyof TAttributes],
      );
      await this.save({ ...pickQueryOptions(options), hooks: false });
    } else {
      await runtime.execute(
        compile(buildDelete(definition, primaryKeyWhere(definition, this.dataValues as Values))),
        options,
      );
    }
    if (opts['hooks'] === true) {
      await runModelHooks(model, 'afterDestroy', this, opts);
    }
  }

  /**
   * Restores this soft-deleted instance of a paranoid model.
   *
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns Resolves when restored.
   * @throws Error when the model is not paranoid.
   */
  async restore(options: QueryOptionsBase & Readonly<{ hooks?: boolean }> = {}): Promise<void> {
    const model = this.constructor as typeof Model;
    const { definition } = stateOf(model);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const hooks = options.hooks !== false;
    if (hooks) {
      await runModelHooks(model, 'beforeRestore', this, options);
    }
    this.setDataValue(
      definition.deletedAt as keyof TAttributes,
      null as TAttributes[keyof TAttributes],
    );
    await this.save({ ...pickQueryOptions(options), hooks: false });
    if (hooks) {
      await runModelHooks(model, 'afterRestore', this, options);
    }
  }

  /**
   * Whether this instance of a paranoid model is soft-deleted.
   *
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   */
  isSoftDeleted(): boolean {
    const { definition } = stateOf(this.constructor);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const value = (this.dataValues as Values)[definition.deletedAt];
    return value !== null && value !== undefined;
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
    const { definition } = stateOf(this.constructor);
    await (this.constructor as typeof Model).increment(fields as AttributeAmounts<Values>, {
      ...(options as IncrementOptions),
      where: primaryKeyWhere(definition, this.dataValues as Values) as WhereOptions,
    });
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
    const { definition } = stateOf(this.constructor);
    await (this.constructor as typeof Model).decrement(fields as AttributeAmounts<Values>, {
      ...(options as IncrementOptions),
      where: primaryKeyWhere(definition, this.dataValues as Values) as WhereOptions,
    });
    return this;
  }

  /**
   * Compares primary keys with another instance.
   *
   * @param other - Instance to compare with.
   * @returns True when all primary key values are equal.
   */
  equals(other: Model): boolean {
    const { definition } = stateOf(this.constructor);
    return (
      other instanceof (this.constructor as typeof Model) &&
      definition.primaryKeys.every((name) =>
        isEqualValue((this.dataValues as Values)[name], (other.dataValues as Values)[name]),
      )
    );
  }

  /**
   * Plain copy of all values with custom getters applied.
   *
   * @returns Plain object.
   */
  toJSON(): TAttributes {
    return structuredClone(this.get({ plain: true }));
  }

  #refresh(definition: ModelDefinition, row: Readonly<Record<string, unknown>> | undefined): this {
    if (row !== undefined) {
      this.set(parseRow(definition, row), { raw: true });
    }
    this.isNewRecord = false;
    this._previousDataValues = { ...this.dataValues };
    this.#changed = new Set();
    return this;
  }
}

const fromRow = <M extends AnyModel>(
  model: ModelStatic<M>,
  row: Readonly<Record<string, unknown>>,
): M => new model(parseRow(stateOf(model).definition, row), { isNewRecord: false, raw: true });

const changeBy = async <M extends AnyModel>(
  model: ModelStatic<M>,
  fields: AttributeAmounts<Values>,
  options: IncrementOptions,
  sign: 1 | -1,
): Promise<[M[], number]> => {
  const { definition, runtime } = stateOf(model);
  const amounts = toAmounts(fields, options.by ?? 1);
  const timestamp = withTimestamps(definition, {}, new Date(), false, options.silent === true);
  const node = buildUpdate(
    definition,
    [...incrementItems(definition, amounts, sign), ...setItems(definition, timestamp)],
    options.where ?? {},
    { returning: true },
  );
  const result = await runtime.execute(compile(node), options);
  return [result.rows.map((row) => fromRow(model, row)), result.rowCount];
};

/** @internal Parses a driver row into attribute values of `model`. */
export const parseModelRow = (
  model: object,
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => parseRow(stateOf(model).definition, row);

const withoutFlag = (row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => key !== INSERTED_FLAG && key !== MERGE_ACTION && !key.startsWith(OLD_PREFIX),
    ),
  );

const sameValue = (left: unknown, right: unknown): boolean =>
  left === right ||
  (left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : JSON.stringify(left) === JSON.stringify(right) || String(left) === String(right));

/**
 * With `ON CONFLICT DO NOTHING` RETURNING has rows only for inserted records (in VALUES order).
 * Aligns them with the input rows; skipped records get `undefined`.
 */
const insertedRowsOf = (
  definition: ModelDefinition,
  inputs: readonly Values[],
  returned: readonly Readonly<Record<string, unknown>>[],
): readonly (Readonly<Record<string, unknown>> | undefined)[] =>
  inputs.reduce<
    Readonly<{ aligned: readonly (Readonly<Record<string, unknown>> | undefined)[]; next: number }>
  >(
    (state, input) => {
      const row = returned[state.next];
      const parsed = row === undefined ? undefined : parseRow(definition, row);
      const matches =
        parsed !== undefined &&
        Object.entries(input).every(
          ([name, value]) =>
            value === undefined ||
            (value === null && definition.attributes.get(name)?.autoIncrement === true) ||
            isExpression(value) ||
            !(name in parsed) ||
            sameValue(parsed[name], value),
        );
      return matches
        ? { aligned: [...state.aligned, row], next: state.next + 1 }
        : { aligned: [...state.aligned, undefined], next: state.next };
    },
    { aligned: [], next: 0 },
  ).aligned;

const returningOld = async (
  runtime: Readonly<{ serverVersion: () => Promise<number> }>,
  options: Readonly<{ returningOld?: boolean }>,
): Promise<boolean> => {
  if (options.returningOld !== true) {
    return false;
  }
  if ((await runtime.serverVersion()) < 180000) {
    throw new Error('returningOld requires PostgreSQL 18 or newer');
  }
  return true;
};

const previousValues = (
  definition: ModelDefinition,
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null => {
  const old = Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key.startsWith(OLD_PREFIX))
      .map(([key, value]) => [key.slice(OLD_PREFIX.length), value]),
  );
  return definition.primaryKeys.every((name) => old[name] === null || old[name] === undefined)
    ? null
    : parseRow(definition, old);
};

const fromWrittenRow = <M extends AnyModel>(
  model: ModelStatic<M>,
  row: Readonly<Record<string, unknown>>,
  old: boolean,
): M => {
  const instance = fromRow(model, withoutFlag(row));
  if (old) {
    oldValuesOf.set(instance, previousValues(stateOf(model).definition, row));
  }
  return instance;
};

const insertWithConflict = async <M extends AnyModel>(
  model: ModelStatic<M>,
  rows: readonly Values[],
  onConflict: OnConflictNode | undefined,
  options: QueryOptionsBase & Readonly<{ overriding?: 'system' | 'user'; returningOld?: boolean }>,
): Promise<M[]> => {
  const { definition, runtime } = stateOf(model);
  const old = await returningOld(runtime, options);
  const insert = buildInsert(definition, rows, {
    ...(onConflict === undefined ? {} : { onConflict }),
    ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
    returning: [...returningAll(definition), insertedFlagColumn()],
  });
  const result = await runtime.execute(
    compile(old ? withReturningOld(definition, insert) : insert),
    options,
  );
  return result.rows.map((row) => {
    const instance = fromWrittenRow(model, row, old);
    insertedFlags.set(instance, row[INSERTED_FLAG] === true);
    return instance;
  });
};

const sequelizes = new WeakMap<object, RuntimeOwner>();

type MutableOptions = Record<string, unknown>;

/** Action reported by `merge_action()`. */
export type MergeActionName = 'INSERT' | 'UPDATE' | 'DELETE';

/** Result of `Model.merge`. */
export type MergeResult<M> = Readonly<{
  /** Number of affected rows. */
  rowCount: number;
  /** Written rows (with `returning: true`). */
  rows: readonly Readonly<{
    /** Action taken. */ action: MergeActionName;
    /** Row after the action. */ instance: M;
  }>[];
}>;

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

const missingHook = (): never => {
  throw new Error('addHook: hook function is required');
};

const validateAll = async (instances: readonly Model[], hooks: boolean): Promise<void> => {
  const failures = await Promise.all(
    instances.map((instance) =>
      instance.validate({ hooks }).then(
        () => undefined,
        (error: unknown) =>
          new BulkRecordError(error instanceof Error ? error : new Error(String(error)), instance),
      ),
    ),
  );
  const errors = failures.filter((failure): failure is BulkRecordError => failure !== undefined);
  if (errors.length > 0) {
    throw new AggregateError(errors);
  }
};

/** @internal Normalized definition of a model class. */
export const definitionOf = (model: object): ModelDefinition => stateOf(model).definition;

const COPY_FORMATS: ReadonlySet<string> = new Set(['text', 'csv', 'binary']);

const singleCharacter = (value: string, name: string): string => {
  if ([...value].length !== 1) {
    throw new Error(`copyTo: ${name} must be a single character`);
  }
  return escapeLiteral(value);
};

const copyFormatSql = (options: CopyToFormatOptions): string => {
  if (options.format !== undefined && !COPY_FORMATS.has(options.format)) {
    throw new Error(`copyTo: unsupported format ${String(options.format)}`);
  }
  const parts = [
    ...(options.format === undefined ? [] : [`FORMAT ${options.format}`]),
    ...(options.header === undefined ? [] : [`HEADER ${options.header ? 'true' : 'false'}`]),
    ...(options.delimiter === undefined
      ? []
      : [`DELIMITER ${singleCharacter(options.delimiter, 'delimiter')}`]),
    ...(options.quote === undefined ? [] : [`QUOTE ${singleCharacter(options.quote, 'quote')}`]),
    ...(options.nullString === undefined ? [] : [`NULL ${escapeLiteral(options.nullString)}`]),
  ];
  return parts.length === 0 ? '' : ` WITH (${parts.join(', ')})`;
};

const toArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

const buildNested = (node: IncludeNode, value: unknown): unknown => {
  const build = (item: unknown): unknown => {
    if (item instanceof Model) {
      return item;
    }
    const child = new node.model(
      item as Values,
      node.children.length === 0 ? {} : { include: node.children.map(toIncludeOptions) },
    );
    const through = node.association.through?.model;
    const throughName = node.through?.definition.name;
    if (
      through !== undefined &&
      throughName !== undefined &&
      typeof item === 'object' &&
      item !== null &&
      throughName in item
    ) {
      const throughValue = (item as Values)[throughName];
      (child.dataValues as Values)[throughName] =
        throughValue instanceof Model ? throughValue : new through(throughValue as Values);
    }
    return child;
  };
  return value === null
    ? null
    : node.association.isMultiAssociation
      ? toArray(value).map(build)
      : build(value);
};

const nestedInstances = (instance: AnyModel, node: IncludeNode): readonly AnyModel[] =>
  toArray((instance.dataValues as Values)[node.as]).filter(
    (item): item is AnyModel => item instanceof Model,
  );

const saveBelongsTo = async (
  instance: AnyModel,
  includes: readonly IncludeNode[],
  options: SaveOptions,
): Promise<void> => {
  await includes
    .filter((node) => node.association.associationType === 'BelongsTo')
    .reduce<Promise<unknown>>(
      (previous, node) =>
        previous.then(async () => {
          const [parent] = nestedInstances(instance, node);
          if (parent !== undefined) {
            await parent.save(pickQueryOptions(options));
            instance.set(node.association.foreignKey, parent.get(node.association.targetKey));
          }
        }),
      Promise.resolve(),
    );
};

const throughValues = (child: AnyModel, node: IncludeNode): Values => {
  const value =
    node.through === undefined
      ? undefined
      : (child.dataValues as Values)[node.through.definition.name];
  return value instanceof Model
    ? (value.get({ plain: true }) as Values)
    : typeof value === 'object' && value !== null
      ? (value as Values)
      : {};
};

const saveChild = async (
  instance: AnyModel,
  node: IncludeNode,
  child: AnyModel,
  options: SaveOptions,
): Promise<void> => {
  const { association } = node;
  const childOptions = pickQueryOptions(options);
  if (association.associationType === 'BelongsToMany' && association.through !== undefined) {
    await child.save(childOptions);
    await association.through.model.create(
      {
        ...throughValues(child, node),
        ...association.through.scope,
        [association.foreignKey]: instance.get(association.sourceKey),
        [association.otherKey ?? '']: child.get(association.targetKey),
      } as never,
      childOptions as never,
    );
    return;
  }
  child.set({
    ...association.scope,
    [association.foreignKey]: instance.get(association.sourceKey),
  });
  await child.save(childOptions);
};

const saveChildren = async (
  instance: AnyModel,
  includes: readonly IncludeNode[],
  options: SaveOptions,
): Promise<void> => {
  const pairs = includes
    .filter((node) => node.association.associationType !== 'BelongsTo')
    .flatMap((node) => nestedInstances(instance, node).map((child) => [node, child] as const));
  await pairs.reduce<Promise<unknown>>(
    (previous, [node, child]) => previous.then(() => saveChild(instance, node, child, options)),
    Promise.resolve(),
  );
};
