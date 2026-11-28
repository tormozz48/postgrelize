import { InstanceState } from '../instance-state.ts';
import type { ModelDefinition } from '../model-definition.ts';
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
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link CreateOperation}. */
export type CreateOperationServices = OperationServices &
  Readonly<{
    /** Model state. */
    registry: ModelRegistry;
    /** Value rules. */
    values: ModelValues;
    /** ON CONFLICT builder. */
    conflicts: OnConflictBuilder;
    /** Conflict-aware inserts. */
    inserter: InsertOperation;
  }>;

// One `Model.create` call with `onConflict`: the built instance and both option objects.
type CreateCall = Readonly<{
  model: ModelStatic<AnyModel>;
  definition: ModelDefinition;
  instance: AnyModel;
  opts: MutableOptions;
  options: CreateOptions;
}>;

/** `Model.create`: builds and saves an instance, or inserts it with `onConflict`. */
export class CreateOperation extends ModelOperation<CreateOperationServices> {
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
    const { definition } = this.services.registry.state(model);
    const opts: MutableOptions = { hooks: true, validate: true, ...options };
    return (await this.#createOnConflict({ model, definition, instance, opts, options })) as M;
  }

  async #createOnConflict(call: CreateCall): Promise<AnyModel> {
    const { model, instance, opts } = call;
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true });
    }
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'beforeCreate', instance, opts);
    }
    const [inserted] = await this.#insert(call);
    if (inserted === undefined) {
      InstanceState.of(instance).wasInserted = false;
      return instance;
    }
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'afterCreate', inserted, opts);
    }
    return inserted;
  }

  #insert({ model, definition, instance, opts, options }: CreateCall): Promise<AnyModel[]> {
    const { conflicts, inserter, values } = this.services;
    const silent = opts['silent'] === true;
    const row = values.withTimestamps(
      definition,
      instance.dataValues as Values,
      new Date(),
      true,
      silent,
    );
    const fields = options.fields as readonly string[] | undefined;
    const onConflict = options.onConflict as OnConflictOptions<unknown>;
    return inserter.withConflict(
      model,
      [values.pick(row, fields)],
      conflicts.build(definition, onConflict, silent),
      options,
    );
  }
}
