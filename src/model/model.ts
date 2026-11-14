import { isDefaultValueGenerator } from '../data-types/data-types.ts';
import { EmptyResultError, InstanceError } from '../errors/errors.ts';
import { isExpression } from '../expressions/methods.ts';
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
  type SelectOptions,
  whereContext,
} from './query-builders.ts';
import { parseRow } from './rows.ts';
import { isEmptyWhere, whereToAst } from '../where/where.ts';
import {
  buildOnConflict,
  INSERTED_FLAG,
  insertedFlagColumn,
  type OnConflictOptions,
} from './on-conflict.ts';
import { returningAll } from './query-builders.ts';
import type { OnConflictNode } from '../sql/ast.ts';
import {
  runtimeKey,
  type ModelRuntime,
  type QueryOptionsBase,
  type RuntimeOwner,
} from './runtime.ts';
import type { MakeNullishOptional, WhereOptions } from './types.ts';

/** Plain attribute values of a model. */
export type Values = Record<string, unknown>;

/** Any model instance type. */
// oxlint-disable-next-line typescript/no-explicit-any -- Sequelize v6 compat: attribute types are unknown here
export type AnyModel = Model<any, any>;

/** Attribute types of model instance type `M`. */
export type Attributes<M extends AnyModel> = M['_attributes'];

/** Creation attribute types of model instance type `M`. */
export type CreationAttributes<M extends AnyModel> = MakeNullishOptional<M['_creationAttributes']>;

/** A model class whose instances are `M` (Sequelize v6 `ModelStatic`). */
export type ModelStatic<M extends AnyModel> = Omit<typeof Model, 'prototype'> & {
  new (values?: Values, options?: BuildOptions): M;
  /** Instance prototype. */
  prototype: M;
};

/** Result of `findAndCountAll`. */
export type FindAndCountResult<M> = {
  /** Total number of matching rows, ignoring `limit` / `offset`. */
  count: number;
  /** Rows of the current page. */
  rows: M[];
};

/** Schema-qualified table name returned by `getTableName`. */
export type QualifiedTableName = Readonly<{
  /** Table name. */
  tableName: string;
  /** Schema name. */
  schema: string;
  /** Separator between schema and table. */
  delimiter: string;
}>;

/** Options of `Model.init`. */
export type InitOptions = DefinitionOptions &
  Readonly<{
    /** Owning `Sequelize` instance. */
    sequelize: RuntimeOwner;
  }>;

/** Options of `Model.build`. */
export type BuildOptions = Readonly<{
  /** Whether the instance represents a row that does not exist yet. Default true. */
  isNewRecord?: boolean;
  /** Set values without setters and without change tracking. */
  raw?: boolean;
}>;

/** Options of finders (Sequelize v6 `FindOptions`, without `include`). */
export type FindOptions<T = Values> = QueryOptionsBase &
  Omit<SelectOptions, 'where'> &
  Readonly<{
    /** Filter. */
    where?: WhereOptions<T>;
    /** Return plain objects instead of instances. */
    raw?: boolean;
    /** With `raw`, build nested objects from dotted keys. */
    nest?: boolean;
    /** Return a single row (used by `findOne`). */
    plain?: boolean;
    /** Throw `EmptyResultError` (or the given error) when no row is found. */
    rejectOnEmpty?: boolean | Error;
  }>;

/** Options of `count`. */
export type CountOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Filter. */
    where?: WhereOptions<T>;
    /** Column to count. */
    col?: string;
    /** `count(DISTINCT ...)`. */
    distinct?: boolean;
    /** Group by attributes; the result becomes an array of `{ count, ...groups }`. */
    group?: string | readonly string[];
  }>;

/** Options of `aggregate`, `max`, `min`, `sum`. */
export type AggregateOptions<T = Values> = CountOptions<T> &
  Readonly<{
    /** Return all rows instead of one value. */
    plain?: boolean;
  }>;

/** Options of `create` and `save`. */
export type SaveOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to save; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Do not update `updatedAt`. */
    silent?: boolean;
    /** Return all columns after insert/update (always enabled for PostgreSQL). */
    returning?: boolean;
  }>;

/** Options of `create`. */
export type CreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Advanced `ON CONFLICT` handling. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `bulkCreate`. */
export type BulkCreateOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** `ON CONFLICT DO NOTHING`. */
    ignoreDuplicates?: boolean;
    /** Attributes updated from the proposed row on conflict (`DO UPDATE SET a = EXCLUDED.a`). */
    updateOnDuplicate?: readonly (keyof T & string)[];
    /** Conflict target attributes for `updateOnDuplicate`. Default: first unique key, else primary key. */
    conflictAttributes?: readonly (keyof T & string)[];
    /** Predicate of a partial unique index used as conflict target. */
    conflictWhere?: WhereOptions<T>;
    /** Advanced `ON CONFLICT` handling; cannot be combined with the options above. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `upsert`. */
export type UpsertOptions<T = Values> = SaveOptions<T> &
  Readonly<{
    /** Conflict target columns. Default: unique key of an updated attribute, else primary key. */
    conflictFields?: readonly string[];
    /** Advanced `ON CONFLICT` handling; the result becomes `[instance, created]`. PostgreSQL extension. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of `Model.insert`. PostgreSQL extension. */
export type InsertOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to insert; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Advanced `ON CONFLICT` handling. */
    onConflict?: OnConflictOptions<T>;
  }>;

/** Options of static `update`. */
export type UpdateOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to update. */
    where: WhereOptions<T>;
    /** Attributes to update; others are ignored. */
    fields?: readonly (keyof T & string)[];
    /** Do not update `updatedAt`. */
    silent?: boolean;
    /** Return updated rows as the second element of the result. */
    returning?: boolean;
  }>;

/** Options of static `destroy`. */
export type DestroyOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to delete. */
    where?: WhereOptions<T>;
    /** Delete at most this many rows. */
    limit?: number;
    /** Use `TRUNCATE` instead of `DELETE`. */
    truncate?: boolean;
    /** With `truncate`: `CASCADE`. */
    cascade?: boolean;
    /** With `truncate`: `RESTART IDENTITY`. */
    restartIdentity?: boolean;
    /** Return deleted rows instead of their count (`DELETE ... RETURNING`). PostgreSQL extension. */
    returning?: boolean;
  }>;

/** Options of `increment` / `decrement`. */
export type IncrementOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Rows to change (static form). */
    where?: WhereOptions<T>;
    /** Amount, default 1. */
    by?: number;
    /** Do not update `updatedAt`. */
    silent?: boolean;
  }>;

/** Options of `findOrCreate` / `findOrBuild`. */
export type FindOrCreateOptions<T = Values> = FindOptions<T> &
  Readonly<{
    /** Values used in addition to `where` when creating. */
    defaults?: Partial<T>;
  }>;

type ModelState = Readonly<{ definition: ModelDefinition; runtime: ModelRuntime }>;

const states = new WeakMap<object, ModelState>();

const insertedFlags = new WeakMap<object, boolean>();

const V6_CONFLICT_OPTIONS = [
  'ignoreDuplicates',
  'updateOnDuplicate',
  'conflictAttributes',
  'conflictWhere',
] as const;

const stateOf = (model: object): ModelState => {
  const state = states.get(model);
  if (state === undefined) {
    throw new Error('Model is not initialized. Call Model.init() or sequelize.define() first.');
  }
  return state;
};

const isEqualValue = (left: unknown, right: unknown): boolean =>
  left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : typeof left === 'object' && left !== null && typeof right === 'object' && right !== null
      ? JSON.stringify(left) === JSON.stringify(right)
      : left === right;

const clone = <T>(value: T): T => (isExpression(value) ? value : structuredClone(value));

const defaultValueOf = (attribute: AttributeDefinition): unknown =>
  isDefaultValueGenerator(attribute.defaultValue)
    ? attribute.defaultValue.generate()
    : clone(attribute.defaultValue);

const initialValues = (definition: ModelDefinition): Values =>
  Object.fromEntries([
    ...[...definition.attributes.values()]
      .filter((attribute) => attribute.defaultValue !== undefined)
      .map((attribute) => [attribute.fieldName, defaultValueOf(attribute)] as const),
    ...definition.primaryKeys
      .filter((name) => definition.attributes.get(name)?.defaultValue === undefined)
      .map((name) => [name, null] as const),
  ]);

const nestRow = (row: Values): Values =>
  Object.entries(row).reduce<Values>((result, [key, value]) => {
    const path = key.split('.');
    const leaf = path.pop() ?? key;
    const parent = path.reduce<Values>((node, part) => {
      const child = node[part];
      return (typeof child === 'object' && child !== null ? child : (node[part] = {})) as Values;
    }, result);
    parent[leaf] = value;
    return result;
  }, {});

const toNumber = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
    ? Number(value)
    : value;

const parseAggregate = (
  attribute: AttributeDefinition | undefined,
  aggregateFunction: string,
  value: unknown,
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  const key = attribute?.type.key;
  if (
    aggregateFunction === 'count' ||
    key === 'INTEGER' ||
    key === 'SMALLINT' ||
    key === 'FLOAT' ||
    key === 'DOUBLE' ||
    key === 'REAL' ||
    key === 'DECIMAL' ||
    key === 'BIGINT'
  ) {
    return toNumber(value);
  }
  return attribute?.type.parse === undefined ? value : attribute.type.parse(value);
};

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
    this.set(values as Values, options.raw === true ? { raw: true } : {});
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
    const { sequelize, ...definitionOptions } = options;
    const runtime = sequelize[runtimeKey];
    const definition = normalizeDefinition(
      this.name,
      attributes,
      definitionOptions,
      runtime.defaults,
    );
    states.set(this, { definition, runtime });
    sequelizes.set(this, sequelize);
    defineAccessors(this.prototype, definition);
    runtime.register(definition.name, this);
    return this;
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
    const instance = new this(values as Values);
    if (options.onConflict === undefined) {
      return instance.save(options as SaveOptions);
    }
    const { definition } = stateOf(this);
    const row = withTimestamps(
      definition,
      instance.dataValues as Values,
      new Date(),
      true,
      options.silent === true,
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
    const rows = records.map((record) =>
      pickFields(
        withTimestamps(definition, new this(record).dataValues as Values, now, true, false),
        options.fields,
      ),
    );
    const onConflict =
      options.onConflict === undefined
        ? undefined
        : buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>);
    return insertWithConflict(this, rows, onConflict, options);
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
    const instance = new this(values as Values);
    const now = new Date();
    const provided = Object.keys(values as Values).filter((name) =>
      definition.attributes.has(name),
    );
    const updatable =
      options.fields === undefined
        ? provided
        : provided.filter((name) => options.fields?.includes(name as never));
    const insertValues = withoutGeneratedKey(
      definition,
      values as Values,
      withTimestamps(definition, instance.dataValues as Values, now, true, false),
    );
    const onConflict =
      options.onConflict === undefined
        ? v6UpsertConflict(definition, insertValues, updatable, options.conflictFields)
        : buildOnConflict(definition, options.onConflict as OnConflictOptions<unknown>);
    const insert = buildInsert(definition, [insertValues], {
      onConflict,
      returning: [...returningAll(definition), insertedFlagColumn()],
    });
    const result = await runtime.execute(compile(insert), options);
    const row = result.rows[0];
    const flag = row?.[INSERTED_FLAG];
    instance.#refresh(definition, row === undefined ? undefined : withoutFlag(row));
    if (options.onConflict === undefined) {
      return [instance, null];
    }
    insertedFlags.set(instance, flag === true);
    return [instance, flag === true];
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
    const now = new Date();
    const instances = records.map((values) => new this(values as Values));
    if (instances.length === 0) {
      return [];
    }
    const rows = instances.map((instance) =>
      pickFields(
        withTimestamps(
          definition,
          instance.dataValues as Values,
          now,
          true,
          options.silent === true,
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
      ...v6BulkConflict(definition, options as BulkCreateOptions),
    });
    const result = await runtime.execute(compile(insert), options);
    instances.forEach((instance, index) => instance.#refresh(definition, result.rows[index]));
    return instances;
  }

  /**
   * Finds all rows matching the options.
   *
   * @param options - Query options.
   * @returns Instances, or plain objects with `raw: true`.
   */
  static async findAll<M extends AnyModel>(
    this: ModelStatic<M>,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    const { definition, runtime } = stateOf(this);
    const result = await runtime.execute(
      compile(buildSelect(definition, options, runtime.inAsAnyThreshold)),
      options,
    );
    if (options.raw === true) {
      const rows = result.rows.map((row) => parseRow(definition, row));
      return (options.nest === true ? rows.map(nestRow) : rows) as unknown as M[];
    }
    return result.rows.map((row) => fromRow(this, row) as M);
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
   * Counts rows.
   *
   * @param options - Count options.
   * @returns Count, or `{ count, ...groups }[]` with `group`.
   */
  static async count<M extends AnyModel>(
    this: ModelStatic<M>,
    options: CountOptions<Attributes<M>> = {},
  ): Promise<number> {
    const { definition, runtime } = stateOf(this);
    const result = await runtime.execute(
      compile(
        buildCount(definition, options as SelectOptions & CountOptions, runtime.inAsAnyThreshold),
      ),
      options,
    );
    if (options.group !== undefined) {
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
    const { definition, runtime } = stateOf(this);
    const name = String(field);
    const result = await runtime.execute(
      compile(
        buildAggregate(
          definition,
          name,
          aggregateFunction,
          options as SelectOptions,
          runtime.inAsAnyThreshold,
        ),
      ),
      options,
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
    const { definition, runtime } = stateOf(this);
    const changes = withTimestamps(
      definition,
      pickFields(values as Values, options.fields),
      new Date(),
      false,
      options.silent === true,
    );
    const node = buildUpdate(definition, setItems(definition, changes), options.where, {
      ...(options.returning === true ? { returning: true } : {}),
      ...(runtime.inAsAnyThreshold === undefined
        ? {}
        : { inAsAnyThreshold: runtime.inAsAnyThreshold }),
    });
    const result = await runtime.execute(compile(node), options);
    return options.returning === true
      ? [result.rowCount, result.rows.map((row) => fromRow(this, row) as M)]
      : [result.rowCount];
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
    const { definition, runtime } = stateOf(this);
    if (options.truncate === true) {
      await (this as unknown as typeof Model).truncate(options);
      return 0;
    }
    const node = buildDelete(definition, options.where, {
      ...(options.returning === true ? { returning: true } : {}),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(runtime.inAsAnyThreshold === undefined
        ? {}
        : { inAsAnyThreshold: runtime.inAsAnyThreshold }),
    });
    const result = await runtime.execute(compile(node), options);
    return options.returning === true
      ? result.rows.map((row) => fromRow(this, row) as M)
      : result.rowCount;
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
    return Object.fromEntries(
      Object.keys(this.dataValues).map((key) => [
        key,
        raw ? (this.dataValues as Values)[key] : this.get(key as keyof TAttributes),
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
    const { definition, runtime } = stateOf(this.constructor);
    const now = new Date();
    if (this.isNewRecord) {
      const values = pickFields(
        withTimestamps(definition, this.dataValues as Values, now, true, options.silent === true),
        options.fields,
      );
      const result = await runtime.execute(
        compile(buildInsert(definition, [values], { returning: true })),
        options,
      );
      return this.#refresh(definition, result.rows[0]);
    }
    const changed = [...this.#changed].filter(
      (name) =>
        definition.attributes.has(name) &&
        (options.fields === undefined ||
          options.fields.includes(name as keyof TAttributes & string)),
    );
    if (changed.length === 0) {
      return this;
    }
    const changes = withTimestamps(
      definition,
      Object.fromEntries(changed.map((name) => [name, (this.dataValues as Values)[name]])),
      now,
      false,
      options.silent === true,
    );
    const node = buildUpdate(
      definition,
      setItems(definition, changes),
      primaryKeyWhere(definition, this._previousDataValues as Values),
      { returning: true },
    );
    const result = await runtime.execute(compile(node), options);
    return this.#refresh(definition, result.rows[0]);
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
  async destroy(options: QueryOptionsBase = {}): Promise<void> {
    const { definition, runtime } = stateOf(this.constructor);
    await runtime.execute(
      compile(buildDelete(definition, primaryKeyWhere(definition, this.dataValues as Values))),
      options,
    );
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

/** Attribute name(s) or a map of attribute name to amount for `increment` / `decrement`. */
export type AttributeAmounts<T> =
  | (keyof T & string)
  | readonly (keyof T & string)[]
  | Partial<Record<keyof T & string, number>>;

const sequelizes = new WeakMap<object, RuntimeOwner>();

const toAmounts = (
  fields: AttributeAmounts<Values>,
  by: number,
): Readonly<Record<string, number>> =>
  typeof fields === 'string'
    ? { [fields]: by }
    : Array.isArray(fields)
      ? Object.fromEntries(fields.map((name: string) => [name, by]))
      : (fields as Readonly<Record<string, number>>);

const pickFields = (values: Values, fields: readonly string[] | undefined): Values =>
  fields === undefined
    ? values
    : Object.fromEntries(Object.entries(values).filter(([key]) => fields.includes(key)));

const pickQueryOptions = (options: QueryOptionsBase): QueryOptionsBase => ({
  ...(options.transaction === undefined ? {} : { transaction: options.transaction }),
  ...(options.logging === undefined ? {} : { logging: options.logging }),
  ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
});

const withTimestamps = (
  definition: ModelDefinition,
  values: Values,
  now: Date,
  creating: boolean,
  silent: boolean,
): Values => ({
  ...values,
  ...(creating &&
  definition.createdAt !== undefined &&
  (values[definition.createdAt] === undefined || values[definition.createdAt] === null)
    ? { [definition.createdAt]: now }
    : {}),
  ...(definition.updatedAt !== undefined && (!silent || creating)
    ? {
        [definition.updatedAt]:
          creating && values[definition.updatedAt] instanceof Date && silent
            ? values[definition.updatedAt]
            : now,
      }
    : {}),
});

const plainWhereValues = (where: unknown): Values =>
  typeof where === 'object' && where !== null && !Array.isArray(where) && !isExpression(where)
    ? Object.fromEntries(
        Object.entries(where).filter(
          ([, value]) => typeof value !== 'object' || value === null || value instanceof Date,
        ),
      )
    : {};

const defineAccessors = (prototype: object, definition: ModelDefinition): void => {
  [...definition.attributes.keys()]
    .filter((name) => !Object.prototype.hasOwnProperty.call(prototype, name))
    .forEach((name) =>
      Object.defineProperty(prototype, name, {
        configurable: true,
        enumerable: false,
        get(this: Model) {
          return this.get(name as never);
        },
        set(this: Model, value: unknown) {
          this.set(name as never, value as never);
        },
      }),
    );
};

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
  Object.fromEntries(Object.entries(row).filter(([key]) => key !== INSERTED_FLAG));

const insertWithConflict = async <M extends AnyModel>(
  model: ModelStatic<M>,
  rows: readonly Values[],
  onConflict: OnConflictNode | undefined,
  options: QueryOptionsBase,
): Promise<M[]> => {
  const { definition, runtime } = stateOf(model);
  const insert = buildInsert(definition, rows, {
    ...(onConflict === undefined ? {} : { onConflict }),
    returning: [...returningAll(definition), insertedFlagColumn()],
  });
  const result = await runtime.execute(compile(insert), options);
  return result.rows.map((row) => {
    const instance = fromRow(model, withoutFlag(row));
    insertedFlags.set(instance, row[INSERTED_FLAG] === true);
    return instance;
  });
};

const fieldsOf = (definition: ModelDefinition, names: readonly string[]): readonly string[] =>
  names.map((name) => definition.attributes.get(name)?.field ?? name);

const firstUniqueKey = (definition: ModelDefinition): readonly string[] | undefined =>
  [...definition.uniqueKeys.values()].find((fields) => fields.length > 0);

const conflictUpdate = (
  attributes: readonly string[],
  target: readonly string[],
  where?: unknown,
): OnConflictNode => ({
  target: {
    kind: 'columns',
    items: target.map((field) => ({ kind: 'ident', path: [field] }) as const),
    ...(where === undefined ? {} : { where: where as never }),
  },
  action:
    attributes.length === 0
      ? { kind: 'nothing' }
      : {
          kind: 'update',
          set: attributes.map((field) => ({
            column: field,
            value: { kind: 'excluded', column: field } as const,
          })),
        },
});

const v6BulkConflict = (
  definition: ModelDefinition,
  options: BulkCreateOptions,
): Readonly<{ onConflict?: OnConflictNode }> => {
  if (options.updateOnDuplicate !== undefined) {
    if (options.updateOnDuplicate.length === 0) {
      throw new Error('updateOnDuplicate option only supports non-empty array.');
    }
    const updatable = options.updateOnDuplicate.filter(
      (name) => definition.attributes.has(name) && name !== definition.createdAt,
    );
    const target =
      options.conflictAttributes ?? firstUniqueKey(definition) ?? definition.primaryKeys;
    const where =
      options.conflictWhere === undefined || isEmptyWhere(options.conflictWhere)
        ? undefined
        : whereToAst(options.conflictWhere, whereContext(definition, undefined));
    return {
      onConflict: conflictUpdate(
        fieldsOf(definition, updatable),
        fieldsOf(definition, target),
        where,
      ),
    };
  }
  return options.ignoreDuplicates === true ? { onConflict: { action: { kind: 'nothing' } } } : {};
};

const v6UpsertConflict = (
  definition: ModelDefinition,
  insertValues: Values,
  updatable: readonly string[],
  conflictFields: readonly string[] | undefined,
): OnConflictNode => {
  const update = [
    ...updatable,
    ...(definition.updatedAt === undefined || updatable.includes(definition.updatedAt)
      ? []
      : [definition.updatedAt]),
  ].filter((name) => name in insertValues);
  const uniqueKey = [...definition.uniqueKeys.values()].find((fields) =>
    fields.some((name) => update.includes(name)),
  );
  const target =
    conflictFields ??
    fieldsOf(
      definition,
      uniqueKey === undefined || update.some((name) => definition.primaryKeys.includes(name))
        ? definition.primaryKeys
        : uniqueKey,
    );
  return conflictUpdate(fieldsOf(definition, update), [...new Set(target)]);
};

const withoutGeneratedKey = (
  definition: ModelDefinition,
  provided: Values,
  values: Values,
): Values => {
  const key = definition.primaryKeys[0];
  return key !== undefined &&
    !(key in provided) &&
    definition.attributes.get(key)?.defaultValue === undefined
    ? Object.fromEntries(Object.entries(values).filter(([name]) => name !== key))
    : values;
};
