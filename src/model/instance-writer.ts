import type { QueryResult } from '../connection/connection-manager.ts';
import { OptimisticLockError } from '../errors/errors.ts';
import type { InstanceLifecycleServices } from './instance-lifecycle-services.ts';
import type { InstanceLifecycle } from './instance-lifecycle.ts';
import type { InstanceState } from './instance-state.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { AnyModel, MutableOptions, SaveOptions, Values } from './options.ts';
import type { ModelRuntime } from './runtime.ts';

/** @internal State of one `save` call. */
export type SaveContext = Readonly<{
  /** Model class. */
  model: object;
  /** Model definition. */
  definition: ModelDefinition;
  /** Runtime of the model. */
  runtime: ModelRuntime;
  /** Instance state. */
  state: InstanceState;
  /** Options passed to hooks (which may change them). */
  opts: MutableOptions;
  /** Options as given. */
  options: SaveOptions;
  /** Whether the instance is inserted. */
  isNew: boolean;
  /** `fields` option. */
  explicitFields: readonly string[] | undefined;
}>;

/**
 * SQL step of `instance.save()`: INSERT of a new instance (with nested associations) or UPDATE of
 * changed attributes with optimistic locking, then the returned row is applied to the instance.
 *
 * @internal
 */
export class InstanceWriter {
  readonly #services: InstanceLifecycleServices;
  readonly #lifecycle: InstanceLifecycle;

  /**
   * @param services - Collaborators.
   * @param lifecycle - Row application.
   */
  constructor(services: InstanceLifecycleServices, lifecycle: InstanceLifecycle) {
    this.#services = services;
    this.#lifecycle = lifecycle;
  }

  /**
   * Inserts a new instance, saving `belongsTo` parents before and children after it.
   *
   * @param instance - Instance.
   * @param context - Save state.
   * @param now - Timestamp of the write.
   * @returns Resolves when written.
   */
  async insert(instance: AnyModel, context: SaveContext, now: Date): Promise<void> {
    const { nested } = this.#services;
    await nested.saveBelongsTo(instance, context.state.includes, context.options);
    const result = await this.#insertRow(context, this.#insertValues(instance, context, now));
    this.#lifecycle.applyRow(instance, context.definition, result.rows[0]);
    await nested.saveChildren(instance, context.state.includes, context.options);
  }

  /**
   * Updates the given attributes of a loaded instance (and its version).
   *
   * @param instance - Instance.
   * @param context - Save state.
   * @param fields - Attributes to write.
   * @param now - Timestamp of the write.
   * @returns Resolves when written.
   * @throws OptimisticLockError when the version no longer matches.
   */
  async update(
    instance: AnyModel,
    context: SaveContext,
    fields: readonly string[],
    now: Date,
  ): Promise<void> {
    const { definition } = context;
    const changes = this.#changes(instance, context, fields, now);
    const previous = instance._previousDataValues as Values;
    const where = this.#updateWhere(definition, previous);
    const set = this.#updateSet(definition, previous, changes);
    const result = await this.#updateRow(context, set, where);
    if (definition.version !== undefined && result.rowCount === 0) {
      throw new OptimisticLockError({ modelName: definition.name, values: set, where });
    }
    this.#lifecycle.applyRow(instance, definition, result.rows[0]);
  }

  #updateRow(
    { definition, options, runtime }: SaveContext,
    set: Values,
    where: Values,
  ): Promise<QueryResult> {
    const { compiler, updates, columns } = this.#services;
    return runtime.execute(
      compiler.compile(
        updates.build(definition, columns.setItems(definition, set), where, { returning: true }),
      ),
      options,
    );
  }

  #insertValues(instance: AnyModel, context: SaveContext, now: Date): Values {
    const rules = this.#services.values;
    const silent = context.opts['silent'] === true;
    return rules.pick(
      rules.withTimestamps(context.definition, instance.dataValues as Values, now, true, silent),
      context.explicitFields,
    );
  }

  #insertRow({ definition, options, runtime }: SaveContext, values: Values): Promise<QueryResult> {
    const { compiler, inserts } = this.#services;
    return runtime.execute(
      compiler.compile(
        inserts.build(definition, [values], {
          returning: true,
          ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
        }),
      ),
      options,
    );
  }

  #changes(instance: AnyModel, context: SaveContext, fields: readonly string[], now: Date): Values {
    const { version } = context.definition;
    const current = instance.dataValues as Values;
    return this.#services.values.withTimestamps(
      context.definition,
      Object.fromEntries(
        fields.filter((name) => name !== version).map((name) => [name, current[name]]),
      ),
      now,
      false,
      context.opts['silent'] === true,
    );
  }

  #updateWhere(definition: ModelDefinition, previous: Values): Values {
    const { version } = definition;
    return {
      ...this.#services.columns.primaryKeyWhere(definition, previous),
      ...(version === undefined ? {} : { [version]: previous[version] }),
    };
  }

  #updateSet(definition: ModelDefinition, previous: Values, changes: Values): Values {
    const { version } = definition;
    return version === undefined
      ? changes
      : { ...changes, [version]: Number(previous[version] ?? 0) + 1 };
  }
}
