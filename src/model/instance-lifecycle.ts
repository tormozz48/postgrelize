import type { IncludeNode } from '../associations/include.ts';
import { InstanceError } from '../errors/errors.ts';
import { HookRegistry, type HookType } from '../hooks/hooks.ts';
import { transactionScope } from '../transaction/transaction-runner.ts';
import { InstanceDestroyer } from './instance-destroyer.ts';
import type { InstanceLifecycleServices, ValidateOptions } from './instance-lifecycle-services.ts';
import { InstanceSaver } from './instance-saver.ts';
import { InstanceState } from './instance-state.ts';
import { InstanceValidation } from './instance-validation.ts';
import type { ModelDefinition } from './model-definition.ts';
import type {
  AnyModel,
  AttributeAmounts,
  BuildOptions,
  FindOptions,
  IncrementOptions,
  InstanceDestroyOptions,
  ModelStatic,
  SaveOptions,
  Values,
} from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { WhereOptions } from './types.ts';

export type { InstanceLifecycleServices, ValidateOptions } from './instance-lifecycle-services.ts';

/**
 * Lifecycle of model instances: construction from values (with nested includes), validation with
 * hooks, `save` (INSERT or UPDATE of changed attributes with optimistic locking), `reload`,
 * `destroy` / `restore` (soft delete for paranoid models), instance `increment` / `decrement`,
 * and the model hook runner used by every operation.
 */
export class InstanceLifecycle {
  readonly #services: InstanceLifecycleServices;
  readonly #validation: InstanceValidation;
  readonly #saver: InstanceSaver;
  readonly #destroyer: InstanceDestroyer;

  /**
   * @param services - Collaborators.
   */
  constructor(services: InstanceLifecycleServices) {
    this.#services = services;
    this.#validation = new InstanceValidation(services, this);
    this.#saver = new InstanceSaver(services, this);
    this.#destroyer = new InstanceDestroyer(services, this);
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
    const { hooks, runtime } = this.#services.registry.state(model);
    InstanceLifecycle.#withActiveTransaction(args.at(-1));
    return HookRegistry.runAll([hooks, runtime.hooks()], type, model, ...args);
  }

  // With CLS, hooks see the current transaction in the options they receive, as in v6 (where every
  // operation puts it into its options first); queries of the operation already use it.
  static #withActiveTransaction(options: unknown): void {
    if (
      typeof options === 'object' &&
      options !== null &&
      Object.getPrototypeOf(options) === Object.prototype &&
      (options as { transaction?: unknown }).transaction === undefined
    ) {
      const active = transactionScope.active();
      if (active !== undefined) {
        (options as { transaction?: unknown }).transaction = active;
      }
    }
  }

  /**
   * Runs a hook for each instance, all at once like v6 (individual hooks of bulk operations).
   *
   * @param model - Model class.
   * @param type - Hook type.
   * @param instances - Instances, passed as the first hook argument.
   * @param args - Further hook arguments.
   * @returns Resolves when all hooks finished.
   */
  async runEach(
    model: object,
    type: HookType,
    instances: readonly object[],
    ...args: readonly unknown[]
  ): Promise<void> {
    // like v6 (`Promise.all`): the hook runs for every row at once, the first rejection ends the call
    await Promise.all(instances.map((instance) => this.runHooks(model, type, instance, ...args)));
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
    const { definition } = this.#services.registry.state(model);
    const state = InstanceState.of(instance);
    instance.isNewRecord = options.isNewRecord ?? true;
    instance.dataValues = instance.isNewRecord ? this.#services.values.initial(definition) : {};
    instance._previousDataValues = {};
    const defined = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => value !== undefined || !(key in instance.dataValues),
      ),
    );
    state.includes = this.#assign(instance, model, defined, options);
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
  validate(instance: AnyModel, options: ValidateOptions = {}): Promise<AnyModel> {
    return this.#validation.validate(instance, options);
  }

  /**
   * Validates instances of a bulk write; failures are collected into one error.
   *
   * @param instances - Instances.
   * @param hooks - Run validation hooks.
   * @returns Resolves when all are valid.
   * @throws AggregateError of BulkRecordError.
   */
  validateAll(instances: readonly AnyModel[], hooks: boolean): Promise<void> {
    return this.#validation.validateAll(instances, hooks);
  }

  /**
   * Inserts the instance if new, otherwise updates its changed attributes.
   *
   * @param instance - Instance.
   * @param options - Save options.
   * @returns The instance with values returned by the database.
   */
  save<I extends AnyModel>(instance: I, options: SaveOptions): Promise<I> {
    return this.#saver.save(instance, options);
  }

  /**
   * Reloads values from the database through `findOne`, so scopes, `paranoid`, `include`, `lock`,
   * `attributes` and find hooks apply as in Sequelize v6.
   *
   * @param instance - Instance.
   * @param options - Find options; `where` is always the primary key of the instance.
   * @returns The instance.
   * @throws InstanceError when the row no longer exists.
   */
  async reload<I extends AnyModel>(instance: I, options: FindOptions): Promise<I> {
    const model = instance.constructor as ModelStatic<AnyModel>;
    const { definition } = this.#services.registry.state(model);
    const where = this.#services.columns.primaryKeyWhere(definition, instance.dataValues as Values);
    const reloaded = await model.findOne({ ...options, where });
    if (reloaded === null) {
      throw new InstanceError(
        'Instance could not be reloaded because it does not exist anymore (find call returned null)',
      );
    }
    instance.set(reloaded.dataValues, { raw: true });
    instance.isNewRecord = false;
    instance._previousDataValues = { ...instance.dataValues };
    InstanceState.of(instance).reset();
    return instance;
  }

  /**
   * Deletes the row of an instance (sets `deletedAt` for paranoid models unless `force`).
   *
   * @param instance - Instance.
   * @param options - Destroy options.
   * @returns The instance after a soft delete, nothing after a DELETE.
   */
  destroy(instance: AnyModel, options: InstanceDestroyOptions): Promise<AnyModel | undefined> {
    return this.#destroyer.destroy(instance, options);
  }

  /**
   * Restores a soft-deleted instance of a paranoid model.
   *
   * @param instance - Instance.
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns The restored instance.
   * @throws Error when the model is not paranoid.
   */
  restore(
    instance: AnyModel,
    options: QueryOptionsBase & Readonly<{ hooks?: boolean }>,
  ): Promise<AnyModel> {
    return this.#destroyer.restore(instance, options);
  }

  /**
   * Whether an instance of a paranoid model is soft-deleted.
   *
   * @param instance - Instance.
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   */
  isSoftDeleted(instance: AnyModel): boolean {
    return this.#destroyer.isSoftDeleted(instance);
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
    const { definition } = this.#services.registry.state(model);
    const where = this.#services.columns.primaryKeyWhere(definition, instance.dataValues as Values);
    return model[method](fields, {
      ...(options as IncrementOptions),
      where: where as WhereOptions,
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
    return this.settle(this.applyRow(instance, definition, row));
  }

  /**
   * Applies a returned row to the values of an instance, leaving its change tracking as it is, so
   * the `after` hooks of a save still see `changed()` and `previous()` (v6 `save`).
   *
   * @param instance - Instance.
   * @param definition - Model definition.
   * @param row - Returned row (`undefined` keeps the values).
   * @returns The instance.
   */
  applyRow<I extends AnyModel>(
    instance: I,
    definition: ModelDefinition,
    row: Readonly<Record<string, unknown>> | undefined,
  ): I {
    if (row !== undefined) {
      instance.set(this.#services.rows.parse(definition, row), { raw: true });
    }
    // like v6, `isNewRecord` is already false inside the after hooks
    instance.isNewRecord = false;
    return instance;
  }

  /**
   * Marks an instance as persisted and unchanged: previous values take the current ones.
   *
   * @param instance - Instance.
   * @param fields - Only these attributes become unchanged (the `fields` option of a save); all when omitted.
   * @returns The instance.
   */
  settle<I extends AnyModel>(instance: I, fields?: readonly string[]): I {
    instance.isNewRecord = false;
    if (fields === undefined) {
      instance._previousDataValues = { ...instance.dataValues };
      InstanceState.of(instance).reset();
      return instance;
    }
    const previous = instance._previousDataValues as Values;
    const current = instance.dataValues as Values;
    const state = InstanceState.of(instance);
    fields.forEach((name) => {
      previous[name] = current[name];
      state.mark(name, false);
    });
    return instance;
  }

  #assign(
    instance: AnyModel,
    model: ModelStatic<AnyModel>,
    values: Values,
    options: BuildOptions,
  ): readonly IncludeNode[] {
    if (options.include === undefined) {
      instance.set(values, options.raw === true ? { raw: true } : {});
      return [];
    }
    const includes = this.#services.includes.normalize(model, options.include);
    const nested = new Set(includes.map((node) => node.as));
    const own = Object.fromEntries(Object.entries(values).filter(([key]) => !nested.has(key)));
    instance.set(own, options.raw === true ? { raw: true } : {});
    this.#buildNested(instance, includes, values);
    return includes;
  }

  #buildNested(instance: AnyModel, includes: readonly IncludeNode[], values: Values): void {
    includes.forEach((node) => {
      const value = values[node.as];
      if (value !== undefined) {
        (instance.dataValues as Values)[node.as] = this.#services.nested.build(node, value);
      }
    });
  }
}
