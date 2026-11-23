import type { InstanceLifecycleServices } from './instance-lifecycle-services.ts';
import type { InstanceLifecycle } from './instance-lifecycle.ts';
import type { ModelState } from './model-registry.ts';
import type { AnyModel, InstanceDestroyOptions, MutableOptions, Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';

type CascadeAssociation = Readonly<{
  options: Readonly<{ onDelete?: string; hooks?: boolean }>;
  get(instance: AnyModel, options: object): Promise<AnyModel | AnyModel[] | null>;
}>;

/**
 * Instance `destroy` (DELETE, or soft delete of paranoid models), `restore` and `isSoftDeleted`.
 *
 * @internal
 */
export class InstanceDestroyer {
  readonly #services: InstanceLifecycleServices;
  readonly #lifecycle: InstanceLifecycle;

  /**
   * @param services - Collaborators.
   * @param lifecycle - Hook runner.
   */
  constructor(services: InstanceLifecycleServices, lifecycle: InstanceLifecycle) {
    this.#services = services;
    this.#lifecycle = lifecycle;
  }

  /**
   * Deletes the row of an instance (sets `deletedAt` for paranoid models unless `force`).
   *
   * @param instance - Instance.
   * @param options - Destroy options.
   * @returns The instance after a soft delete (like v6), nothing after a DELETE.
   */
  async destroy(
    instance: AnyModel,
    options: InstanceDestroyOptions,
  ): Promise<AnyModel | undefined> {
    const model = instance.constructor;
    const state = this.#services.registry.state(model);
    const opts: MutableOptions = { hooks: true, force: false, ...options };
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeDestroy', instance, opts);
    }
    const { deletedAt } = state.definition;
    const soft = deletedAt !== undefined && opts['force'] !== true;
    await (soft
      ? this.#softDelete(instance, deletedAt, options)
      : this.#deleteRow(instance, state, options));
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterDestroy', instance, opts);
    }
    return soft ? instance : undefined;
  }

  /**
   * Restores a soft-deleted instance of a paranoid model.
   *
   * @param instance - Instance.
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns The restored instance (like v6).
   * @throws Error when the model is not paranoid.
   */
  async restore(
    instance: AnyModel,
    options: QueryOptionsBase & Readonly<{ hooks?: boolean }>,
  ): Promise<AnyModel> {
    const model = instance.constructor;
    const deletedAt = this.#deletedAt(model);
    const hooks = options.hooks !== false;
    if (hooks) {
      await this.#lifecycle.runHooks(model, 'beforeRestore', instance, options);
    }
    instance.setDataValue(deletedAt, null);
    await instance.save({ ...this.#services.values.queryOptions(options), hooks: false });
    if (hooks) {
      await this.#lifecycle.runHooks(model, 'afterRestore', instance, options);
    }
    return instance;
  }

  /**
   * Whether an instance of a paranoid model is soft-deleted.
   *
   * @param instance - Instance.
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   */
  isSoftDeleted(instance: AnyModel): boolean {
    const value = (instance.dataValues as Values)[this.#deletedAt(instance.constructor)];
    return value !== null && value !== undefined;
  }

  #deletedAt(model: object): string {
    const { definition } = this.#services.registry.state(model);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    return definition.deletedAt;
  }

  async #softDelete(
    instance: AnyModel,
    deletedAt: string,
    options: InstanceDestroyOptions,
  ): Promise<void> {
    instance.setDataValue(deletedAt, new Date());
    await instance.save({ ...this.#services.values.queryOptions(options), hooks: false });
  }

  // `onDelete: 'CASCADE'` with `hooks: true`: destroy the associated rows one by one, with their hooks (v6).
  async #cascade(instance: AnyModel, options: InstanceDestroyOptions): Promise<void> {
    const { associations } = this.#services.registry.state(instance.constructor);
    for (const association of associations.values() as Iterable<CascadeAssociation>) {
      const { onDelete, hooks } = association.options;
      if (hooks === true && onDelete?.toLowerCase() === 'cascade') {
        // oxlint-disable-next-line no-await-in-loop -- one association after another, as in v6.
        const found = await association.get(instance, options);
        // oxlint-disable-next-line no-await-in-loop -- each row is destroyed with its hooks, one by one.
        for (const row of found === null ? [] : [found].flat()) await row.destroy(options);
      }
    }
  }

  async #deleteRow(
    instance: AnyModel,
    { definition, runtime }: ModelState,
    options: InstanceDestroyOptions,
  ): Promise<void> {
    const { compiler, deletes, columns } = this.#services;
    await this.#cascade(instance, options);
    await runtime.execute(
      compiler.compile(
        deletes.build(
          definition,
          columns.primaryKeyWhere(definition, instance.dataValues as Values),
        ),
      ),
      options,
    );
  }
}
