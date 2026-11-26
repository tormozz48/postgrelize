import type { HookType } from '../hooks/hooks.ts';
import type { InstanceLifecycleServices } from './instance-lifecycle-services.ts';
import type { InstanceLifecycle } from './instance-lifecycle.ts';
import { InstanceState } from './instance-state.ts';
import { InstanceWriter, type SaveContext } from './instance-writer.ts';
import type { AnyModel, SaveOptions, Values } from './options.ts';

/**
 * `instance.save()`: validation, `beforeCreate` / `beforeUpdate` hooks (with re-validation of
 * attributes the hooks changed), the INSERT or UPDATE, then the `after` hooks.
 *
 * @internal
 */
export class InstanceSaver {
  readonly #services: InstanceLifecycleServices;
  readonly #lifecycle: InstanceLifecycle;
  readonly #writer: InstanceWriter;

  /**
   * @param services - Collaborators.
   * @param lifecycle - Hook runner and row refresh.
   */
  constructor(services: InstanceLifecycleServices, lifecycle: InstanceLifecycle) {
    this.#services = services;
    this.#lifecycle = lifecycle;
    this.#writer = new InstanceWriter(services, lifecycle);
  }

  /**
   * Inserts the instance if new, otherwise updates its changed attributes.
   *
   * @param instance - Instance.
   * @param options - Save options.
   * @returns The instance with values returned by the database.
   */
  async save<I extends AnyModel>(instance: I, options: SaveOptions): Promise<I> {
    const context = this.#context(instance, options);
    const { defaultFields } = context;
    const fields =
      context.explicitFields ??
      (context.isNew ? this.#attributes(context) : this.#defaulted(context, defaultFields));
    const now = new Date();
    this.#stampNew(instance, context, now);
    const hookFields = await this.#prepare(instance, context, fields);
    // like v6, validation and the before hooks run even when nothing changed; they may still change something
    if (!context.isNew && this.#unchanged(context, hookFields)) {
      return instance;
    }
    await (context.isNew
      ? this.#writer.insert(instance, context, now)
      : this.#writer.update(instance, context, hookFields, now));
    if (context.opts['hooks'] === true) {
      await this.#hook(instance, context, 'afterCreate', 'afterUpdate');
    }
    // v6 resets previous values and `changed` only after the after hooks, which still read them
    return this.#lifecycle.settle(instance, this.#settled(context, hookFields));
  }

  // the changed (and stored) attributes, only those `update` passed when it set `defaultFields`
  #defaulted(context: SaveContext, defaults: readonly string[] | undefined): readonly string[] {
    const changed = this.#changed(context);
    return defaults === undefined ? changed : changed.filter((name) => defaults.includes(name));
  }

  #unchanged(context: SaveContext, fields: readonly string[]): boolean {
    const untouched = context.defaultFields !== undefined || this.#changed(context).length === 0;
    return untouched && fields.length === 0;
  }

  // With a `fields` option only those attributes (and the timestamps the save wrote) become unchanged.
  #settled(context: SaveContext, written: readonly string[]): readonly string[] | undefined {
    if (context.explicitFields === undefined && context.defaultFields === undefined) {
      return undefined;
    }
    const { createdAt, updatedAt } = context.definition;
    return [...written, ...[createdAt, updatedAt].filter((name) => name !== undefined)];
  }

  // Like v6, a new record gets its `createdAt` / `updatedAt` before validation, so a timestamp attribute
  // declared with `allowNull: false` passes the not-null check.
  #stampNew(instance: AnyModel, context: SaveContext, now: Date): void {
    if (context.isNew) {
      const silent = context.opts['silent'] === true;
      const values = instance.dataValues as Values;
      Object.assign(
        values,
        this.#services.values.withTimestamps(context.definition, values, now, true, silent),
      );
    }
  }

  #context(instance: AnyModel, options: SaveOptions): SaveContext {
    const model = instance.constructor;
    const { definition, runtime } = this.#services.registry.state(model);
    return {
      model,
      definition,
      runtime,
      state: InstanceState.of(instance),
      opts: { hooks: true, validate: true, ...options },
      options,
      isNew: instance.isNewRecord,
      defaultFields: (options as Readonly<{ defaultFields?: readonly string[] }>).defaultFields,
      explicitFields: this.#services.values.saveFields(
        definition,
        options.fields as readonly string[] | undefined,
        instance.isNewRecord,
      ),
    };
  }

  #attributes(context: SaveContext): readonly string[] {
    return [...context.definition.attributes.keys()];
  }

  #changed({ state, definition }: SaveContext): readonly string[] {
    // virtual attributes have no column to write
    return [...state.changed].filter((name) => {
      const attribute = definition.attributes.get(name);
      return attribute !== undefined && attribute.type.isVirtual !== true;
    });
  }

  #hook(
    instance: AnyModel,
    context: SaveContext,
    create: HookType,
    update: HookType,
  ): Promise<void> {
    const type = context.isNew ? create : update;
    return this.#lifecycle.runHooks(context.model, type, instance, context.opts);
  }

  async #prepare(
    instance: AnyModel,
    context: SaveContext,
    fields: readonly string[],
  ): Promise<readonly string[]> {
    const { opts } = context;
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true, fields });
    }
    if (opts['hooks'] !== true) {
      return fields;
    }
    const before = this.#changed(context);
    await this.#hook(instance, context, 'beforeCreate', 'beforeUpdate');
    if (context.explicitFields !== undefined || context.isNew) {
      return fields;
    }
    return this.#addChanged(instance, context, fields, before);
  }

  /** Adds attributes changed by `beforeUpdate` hooks to the saved fields, validating them. */
  async #addChanged(
    instance: AnyModel,
    context: SaveContext,
    fields: readonly string[],
    before: readonly string[],
  ): Promise<readonly string[]> {
    const added = this.#changed(context).filter((name) => !before.includes(name));
    if (context.opts['validate'] === true) {
      await instance.validate({
        hooks: context.opts['hooks'] === true,
        skip: this.#attributes(context).filter((name) => !added.includes(name)),
      });
    }
    return [...fields, ...added];
  }
}
