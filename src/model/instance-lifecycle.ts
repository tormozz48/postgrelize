import type { IncludeResolver } from '../associations/include-resolver.ts';
import type { NestedCreator } from '../associations/nested-creator.ts';
import {
  AggregateError,
  BulkRecordError,
  InstanceError,
  OptimisticLockError,
  ValidationError,
} from '../errors/errors.ts';
import { HookRegistry, type HookType } from '../hooks/hooks.ts';
import type { SqlCompiler } from '../sql/compile.ts';
import type { InstanceValidator } from '../validation/instance-validator.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { DeleteQueryBuilder } from './delete-query-builder.ts';
import type { InsertQueryBuilder } from './insert-query-builder.ts';
import { InstanceState } from './instance-state.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { ModelValues } from './model-values.ts';
import type {
  AnyModel,
  AttributeAmounts,
  BuildOptions,
  IncrementOptions,
  InstanceDestroyOptions,
  ModelStatic,
  MutableOptions,
  SaveOptions,
  Values,
} from './options.ts';
import type { RowMapper } from './row-mapper.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { SelectQueryBuilder } from './select-query-builder.ts';
import type { WhereOptions } from './types.ts';
import type { UpdateQueryBuilder } from './update-query-builder.ts';

/** Options of `instance.validate()`. */
export type ValidateOptions = Readonly<{
  /** Run `beforeValidate` / `afterValidate` / `validationFailed` hooks. Default true. */
  hooks?: boolean;
  /** Attributes to skip. */
  skip?: readonly string[];
  /** Only validate these attributes. */
  fields?: readonly string[];
}>;

/** Collaborators of {@link InstanceLifecycle}. */
export type InstanceLifecycleServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Value rules. */
  values: ModelValues;
  /** Row parsing. */
  rows: RowMapper;
  /** Shared column helpers. */
  columns: AttributeColumns;
  /** SELECT builder (`reload`). */
  selects: SelectQueryBuilder;
  /** INSERT builder (`save` of new instances). */
  inserts: InsertQueryBuilder;
  /** UPDATE builder (`save` of loaded instances). */
  updates: UpdateQueryBuilder;
  /** DELETE builder (`destroy`). */
  deletes: DeleteQueryBuilder;
  /** Include tree of nested builds. */
  includes: IncludeResolver;
  /** Nested creation. */
  nested: NestedCreator;
  /** Attribute / model validators. */
  validator: InstanceValidator;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/**
 * Lifecycle of model instances: construction from values (with nested includes), validation with
 * hooks, `save` (INSERT or UPDATE of changed attributes with optimistic locking), `reload`,
 * `destroy` / `restore` (soft delete for paranoid models), instance `increment` / `decrement`,
 * and the model hook runner used by every operation.
 */
export class InstanceLifecycle {
  readonly #registry: ModelRegistry;
  readonly #values: ModelValues;
  readonly #rows: RowMapper;
  readonly #columns: AttributeColumns;
  readonly #selects: SelectQueryBuilder;
  readonly #inserts: InsertQueryBuilder;
  readonly #updates: UpdateQueryBuilder;
  readonly #deletes: DeleteQueryBuilder;
  readonly #includes: IncludeResolver;
  readonly #nested: NestedCreator;
  readonly #validator: InstanceValidator;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: InstanceLifecycleServices) {
    this.#registry = services.registry;
    this.#values = services.values;
    this.#rows = services.rows;
    this.#columns = services.columns;
    this.#selects = services.selects;
    this.#inserts = services.inserts;
    this.#updates = services.updates;
    this.#deletes = services.deletes;
    this.#includes = services.includes;
    this.#nested = services.nested;
    this.#validator = services.validator;
    this.#compiler = services.compiler;
  }

  /**
   * Runs model hooks, then Sequelize-level hooks, with the model class as `this`.
   *
   * @param model - Model class.
   * @param type - Hook type.
   * @param args - Hook arguments.
   * @returns Resolves when all hooks finished.
   */
  runHooks(model: object, type: HookType, ...args: readonly unknown[]): Promise<void> {
    const { hooks, runtime } = this.#registry.state(model);
    return HookRegistry.runAll([hooks, runtime.hooks()], type, model, ...args);
  }

  /**
   * Initializes a new instance (`new Model(values, options)`): defaults for new records, values
   * (raw or through setters), nested include instances and change tracking.
   *
   * @param instance - Instance being constructed.
   * @param values - Attribute values (and nested include values).
   * @param options - Build options.
   */
  initialize(instance: AnyModel, values: Values, options: BuildOptions): void {
    const model = instance.constructor as ModelStatic<AnyModel>;
    const { definition } = this.#registry.state(model);
    const state = instance[InstanceState.key]();
    instance.isNewRecord = options.isNewRecord ?? true;
    instance.dataValues = instance.isNewRecord ? this.#values.initial(definition) : {};
    instance._previousDataValues = {};
    const includes =
      options.include === undefined ? [] : this.#includes.normalize(model, options.include);
    const nested = new Set(includes.map((node) => node.as));
    const own = Object.fromEntries(Object.entries(values).filter(([key]) => !nested.has(key)));
    instance.set(own, options.raw === true ? { raw: true } : {});
    includes.forEach((node) => {
      const value = values[node.as];
      if (value !== undefined) {
        (instance.dataValues as Values)[node.as] = this.#nested.build(node, value);
      }
    });
    state.includes = includes;
    if (!instance.isNewRecord || options.raw === true) {
      instance._previousDataValues = { ...instance.dataValues };
      state.reset();
    }
  }

  /**
   * Validates an instance like Sequelize v6 `instance.validate()`.
   *
   * @param instance - Instance.
   * @param options - `hooks`, `skip`, `fields`.
   * @returns Resolves when valid.
   * @throws ValidationError with all failures.
   */
  async validate(instance: AnyModel, options: ValidateOptions = {}): Promise<void> {
    const model = instance.constructor;
    const state = this.#registry.state(model);
    const hooks = options.hooks !== false;
    const attributes = [...state.definition.attributes.keys()];
    const skip = new Set(
      options.skip ??
        (options.fields === undefined
          ? []
          : attributes.filter((name) => !options.fields?.includes(name))),
    );
    if (hooks) {
      await this.runHooks(model, 'beforeValidate', instance, options);
    }
    const items = await this.#validator.validate(
      {
        instance,
        definition: state.definition,
        values: instance.dataValues as Readonly<Record<string, unknown>>,
        previous: instance._previousDataValues as Readonly<Record<string, unknown>>,
        isNewRecord: instance.isNewRecord,
      },
      { skip },
      state.validators,
      state.schema,
    );
    if (items.length > 0) {
      const error = new ValidationError(null, items);
      if (hooks) {
        await this.runHooks(model, 'validationFailed', instance, options, error);
      }
      throw error;
    }
    if (hooks) {
      await this.runHooks(model, 'afterValidate', instance, options);
    }
  }

  /**
   * Validates instances of a bulk write; failures are collected into one error.
   *
   * @param instances - Instances.
   * @param hooks - Run validation hooks.
   * @returns Resolves when all are valid.
   * @throws AggregateError of BulkRecordError.
   */
  async validateAll(instances: readonly AnyModel[], hooks: boolean): Promise<void> {
    const failures = await Promise.all(
      instances.map((instance) =>
        instance.validate({ hooks }).then(
          () => undefined,
          (error: unknown) =>
            new BulkRecordError(
              error instanceof Error ? error : new Error(String(error)),
              instance,
            ),
        ),
      ),
    );
    const errors = failures.filter((failure): failure is BulkRecordError => failure !== undefined);
    if (errors.length > 0) {
      throw new AggregateError(errors);
    }
  }

  /**
   * Inserts the instance if new, otherwise updates its changed attributes.
   *
   * @param instance - Instance.
   * @param options - Save options.
   * @returns The instance with values returned by the database.
   */
  async save<I extends AnyModel>(instance: I, options: SaveOptions): Promise<I> {
    const model = instance.constructor;
    const { definition, runtime } = this.#registry.state(model);
    const state = instance[InstanceState.key]();
    const opts: MutableOptions = { hooks: true, validate: true, ...options };
    const isNew = instance.isNewRecord;
    const attributes = [...definition.attributes.keys()];
    const changedAttributes = (): readonly string[] =>
      [...state.changed].filter((name) => definition.attributes.has(name));
    const explicitFields = options.fields as readonly string[] | undefined;
    const fields = explicitFields ?? (isNew ? attributes : changedAttributes());
    if (!isNew && fields.length === 0) {
      return instance;
    }
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true, fields });
    }
    const hookFields = await (async (): Promise<readonly string[]> => {
      if (opts['hooks'] !== true) {
        return fields;
      }
      const before = changedAttributes();
      await this.runHooks(model, isNew ? 'beforeCreate' : 'beforeUpdate', instance, opts);
      const added =
        explicitFields === undefined && !isNew
          ? changedAttributes().filter((name) => !before.includes(name))
          : [];
      if (explicitFields === undefined && !isNew && opts['validate'] === true) {
        await instance.validate({
          hooks: opts['hooks'] === true,
          skip: attributes.filter((name) => !added.includes(name)),
        });
      }
      return [...fields, ...added];
    })();
    const now = new Date();
    if (isNew) {
      await this.#nested.saveBelongsTo(instance, state.includes, options);
      const values = this.#values.pick(
        this.#values.withTimestamps(
          definition,
          instance.dataValues as Values,
          now,
          true,
          opts['silent'] === true,
        ),
        explicitFields,
      );
      const result = await runtime.execute(
        this.#compiler.compile(
          this.#inserts.build(definition, [values], {
            returning: true,
            ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
          }),
        ),
        options,
      );
      this.refresh(instance, definition, result.rows[0]);
      await this.#nested.saveChildren(instance, state.includes, options);
    } else {
      const version = definition.version;
      const current = instance.dataValues as Values;
      const changes = this.#values.withTimestamps(
        definition,
        Object.fromEntries(
          hookFields.filter((name) => name !== version).map((name) => [name, current[name]]),
        ),
        now,
        false,
        opts['silent'] === true,
      );
      const previousVersion =
        version === undefined ? undefined : (instance._previousDataValues as Values)[version];
      const where = {
        ...this.#columns.primaryKeyWhere(definition, instance._previousDataValues as Values),
        ...(version === undefined ? {} : { [version]: previousVersion }),
      };
      const set =
        version === undefined
          ? changes
          : { ...changes, [version]: Number(previousVersion ?? 0) + 1 };
      const result = await runtime.execute(
        this.#compiler.compile(
          this.#updates.build(definition, this.#columns.setItems(definition, set), where, {
            returning: true,
          }),
        ),
        options,
      );
      if (version !== undefined && result.rowCount === 0) {
        throw new OptimisticLockError({ modelName: definition.name, values: set, where });
      }
      this.refresh(instance, definition, result.rows[0]);
    }
    if (opts['hooks'] === true) {
      await this.runHooks(model, isNew ? 'afterCreate' : 'afterUpdate', instance, opts);
    }
    return instance;
  }

  /**
   * Reloads values from the database.
   *
   * @param instance - Instance.
   * @param options - Query options.
   * @returns The instance.
   * @throws InstanceError when the row no longer exists.
   */
  async reload<I extends AnyModel>(instance: I, options: QueryOptionsBase): Promise<I> {
    const { definition, runtime } = this.#registry.state(instance.constructor);
    const result = await runtime.execute(
      this.#compiler.compile(
        this.#selects.build(definition, {
          where: this.#columns.primaryKeyWhere(definition, instance.dataValues as Values),
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
    return this.refresh(instance, definition, result.rows[0]);
  }

  /**
   * Deletes the row of an instance (sets `deletedAt` for paranoid models unless `force`).
   *
   * @param instance - Instance.
   * @param options - Destroy options.
   * @returns Resolves when deleted.
   */
  async destroy(instance: AnyModel, options: InstanceDestroyOptions): Promise<void> {
    const model = instance.constructor;
    const { definition, runtime } = this.#registry.state(model);
    const opts: MutableOptions = { hooks: true, force: false, ...options };
    if (opts['hooks'] === true) {
      await this.runHooks(model, 'beforeDestroy', instance, opts);
    }
    if (definition.deletedAt !== undefined && opts['force'] !== true) {
      instance.setDataValue(definition.deletedAt, new Date());
      await instance.save({ ...this.#values.queryOptions(options), hooks: false });
    } else {
      await runtime.execute(
        this.#compiler.compile(
          this.#deletes.build(
            definition,
            this.#columns.primaryKeyWhere(definition, instance.dataValues as Values),
          ),
        ),
        options,
      );
    }
    if (opts['hooks'] === true) {
      await this.runHooks(model, 'afterDestroy', instance, opts);
    }
  }

  /**
   * Restores a soft-deleted instance of a paranoid model.
   *
   * @param instance - Instance.
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns Resolves when restored.
   * @throws Error when the model is not paranoid.
   */
  async restore(
    instance: AnyModel,
    options: QueryOptionsBase & Readonly<{ hooks?: boolean }>,
  ): Promise<void> {
    const model = instance.constructor;
    const { definition } = this.#registry.state(model);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const hooks = options.hooks !== false;
    if (hooks) {
      await this.runHooks(model, 'beforeRestore', instance, options);
    }
    instance.setDataValue(definition.deletedAt, null);
    await instance.save({ ...this.#values.queryOptions(options), hooks: false });
    if (hooks) {
      await this.runHooks(model, 'afterRestore', instance, options);
    }
  }

  /**
   * Whether an instance of a paranoid model is soft-deleted.
   *
   * @param instance - Instance.
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   */
  isSoftDeleted(instance: AnyModel): boolean {
    const { definition } = this.#registry.state(instance.constructor);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const value = (instance.dataValues as Values)[definition.deletedAt];
    return value !== null && value !== undefined;
  }

  /**
   * Increments / decrements attributes of the instance's row through the model static.
   *
   * @param instance - Instance.
   * @param method - `'increment'` or `'decrement'`.
   * @param fields - Attribute name(s) or map of amounts.
   * @param options - Options.
   * @returns Result of the model static.
   */
  changeBy(
    instance: AnyModel,
    method: 'increment' | 'decrement',
    fields: AttributeAmounts<Values>,
    options: Omit<IncrementOptions, 'where'>,
  ): Promise<unknown> {
    const model = instance.constructor as ModelStatic<AnyModel>;
    const { definition } = this.#registry.state(model);
    return model[method](fields, {
      ...(options as IncrementOptions),
      where: this.#columns.primaryKeyWhere(
        definition,
        instance.dataValues as Values,
      ) as WhereOptions,
    });
  }

  /**
   * Applies a returned row to an instance and marks it as persisted and unchanged.
   *
   * @param instance - Instance.
   * @param definition - Model definition.
   * @param row - Returned row (`undefined` keeps the values).
   * @returns The instance.
   */
  refresh<I extends AnyModel>(
    instance: I,
    definition: ModelDefinition,
    row: Readonly<Record<string, unknown>> | undefined,
  ): I {
    if (row !== undefined) {
      instance.set(this.#rows.parse(definition, row), { raw: true });
    }
    instance.isNewRecord = false;
    instance._previousDataValues = { ...instance.dataValues };
    instance[InstanceState.key]().reset();
    return instance;
  }
}
