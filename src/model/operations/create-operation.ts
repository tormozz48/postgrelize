import { InstanceState } from '../instance-state.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type { OnConflictBuilder, OnConflictOptions } from '../on-conflict-builder.ts';
import type {
  AnyModel,
  CreateOptions,
  ModelStatic,
  MutableOptions,
  SaveOptions,
  Values,
} from '../options.ts';
import type { InsertOperation } from './insert-operation.ts';

/** Collaborators of {@link CreateOperation}. */
export type CreateOperationServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Hooks. */
  lifecycle: InstanceLifecycle;
  /** Value rules. */
  values: ModelValues;
  /** ON CONFLICT builder. */
  conflicts: OnConflictBuilder;
  /** Conflict-aware inserts. */
  inserter: InsertOperation;
}>;

/** `Model.create`: builds and saves an instance, or inserts it with `onConflict`. */
export class CreateOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #conflicts: OnConflictBuilder;
  readonly #inserter: InsertOperation;

  /**
   * @param services - Collaborators.
   */
  constructor(services: CreateOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#conflicts = services.conflicts;
    this.#inserter = services.inserter;
  }

  /**
   * `Model.create`.
   *
   * @param model - Model class.
   * @param values - Attribute values.
   * @param options - Create options.
   * @returns Saved instance (with `onConflict`: the written row, or the unsaved instance with
   * `wasInserted: false` when nothing was written).
   */
  async create<M extends AnyModel>(
    model: ModelStatic<M>,
    values: Values | undefined,
    options: CreateOptions,
  ): Promise<M> {
    const instance = new model(
      values,
      options.include === undefined ? {} : { include: options.include },
    );
    if (options.onConflict === undefined) {
      return instance.save(options as SaveOptions);
    }
    const { definition } = this.#registry.state(model);
    const opts: MutableOptions = { hooks: true, validate: true, ...options };
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true });
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeCreate', instance, opts);
    }
    const row = this.#values.withTimestamps(
      definition,
      instance.dataValues as Values,
      new Date(),
      true,
      opts['silent'] === true,
    );
    const [inserted] = await this.#inserter.withConflict(
      model,
      [this.#values.pick(row, options.fields as readonly string[] | undefined)],
      this.#conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>),
      options,
    );
    if (inserted === undefined) {
      InstanceState.of(instance).wasInserted = false;
      return instance;
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterCreate', inserted, opts);
    }
    return inserted;
  }
}
