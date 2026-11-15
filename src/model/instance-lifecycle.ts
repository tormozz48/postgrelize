import type { IncludeNode } from '../associations/include.ts';
import { InstanceError } from '../errors/errors.ts';
import { HookRegistry, type HookType } from '../hooks/hooks.ts';
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
    return HookRegistry.runAll([hooks, runtime.hooks()], type, model, ...args);
  }

  /**
   * Runs a hook for each instance, one after another (individual hooks of bulk operations).
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
    for (const instance of instances) {
      // oxlint-disable-next-line no-await-in-loop -- hooks of one bulk call run in order, as in v6.
      await this.runHooks(model, type, instance, ...args);
    }
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
    state.includes = this.#assign(instance, model, values, options);
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
  validate(instance: AnyModel, options: ValidateOptions = {}): Promise<void> {
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
   * Reloads values from the database.
   *
   * @param instance - Instance.
   * @param options - Query options.
   * @returns The instance.
   * @throws InstanceError when the row no longer exists.
   */
  async reload<I extends AnyModel>(instance: I, options: QueryOptionsBase): Promise<I> {
    const { registry, compiler, selects, columns } = this.#services;
    const { definition, runtime } = registry.state(instance.constructor);
    const where = columns.primaryKeyWhere(definition, instance.dataValues as Values);
    const result = await runtime.execute(
      compiler.compile(selects.build(definition, { where, limit: 1 })),
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
  destroy(instance: AnyModel, options: InstanceDestroyOptions): Promise<void> {
    return this.#destroyer.destroy(instance, options);
  }

  /**
   * Restores a soft-deleted instance of a paranoid model.
   *
   * @param instance - Instance.
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns Resolves when restored.
   * @throws Error when the model is not paranoid.
   */
  restore(
    instance: AnyModel,
    options: QueryOptionsBase & Readonly<{ hooks?: boolean }>,
  ): Promise<void> {
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
    if (row !== undefined) {
      instance.set(this.#services.rows.parse(definition, row), { raw: true });
    }
    instance.isNewRecord = false;
    instance._previousDataValues = { ...instance.dataValues };
    InstanceState.of(instance).reset();
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
