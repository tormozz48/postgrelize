import type { ValidateOptions } from './instance-lifecycle.ts';
import { lifecycle } from './model-services.ts';
import type {
  AnyModel,
  AttributeAmounts,
  IncrementOptions,
  InstanceDestroyOptions,
  SaveOptions,
  Values,
} from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';

/**
 * Persistence of model instances: `save`, `validate`, `update`, `reload`, `destroy`, `restore`, `isSoftDeleted`, `increment`, `decrement`.
 *
 * @internal
 */
export class ModelInstancePersistence<TAttributes extends object = Values> {
  /** Current attribute values. */
  declare dataValues: TAttributes;

  /**
   * Inserts the instance if new, otherwise updates its changed attributes.
   *
   * @param options - Save options.
   * @returns This instance with values returned by the database.
   */
  save(options: SaveOptions<TAttributes> = {}): Promise<this> {
    return lifecycle.save(
      this as unknown as AnyModel,
      options as SaveOptions,
    ) as unknown as Promise<this>;
  }

  /**
   * Validates the instance (Sequelize v6 `instance.validate()`).
   *
   * @param options - `hooks`, `skip`, `fields`.
   * @returns Resolves when valid.
   * @throws ValidationError with all failures.
   */
  validate(options: ValidateOptions = {}): Promise<void> {
    return lifecycle.validate(this as unknown as AnyModel, options);
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
    (this as unknown as AnyModel).set(values);
    return this.save(options);
  }

  /**
   * Reloads values from the database.
   *
   * @param options - Query options.
   * @returns This instance.
   * @throws InstanceError when the row no longer exists.
   */
  reload(options: QueryOptionsBase = {}): Promise<this> {
    return lifecycle.reload(this as unknown as AnyModel, options) as unknown as Promise<this>;
  }

  /**
   * Deletes the row of this instance.
   *
   * @param options - Query options.
   * @returns Resolves when deleted.
   */
  destroy(options: InstanceDestroyOptions = {}): Promise<void> {
    return lifecycle.destroy(this as unknown as AnyModel, options);
  }

  /**
   * Restores this soft-deleted instance of a paranoid model.
   *
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns Resolves when restored.
   * @throws Error when the model is not paranoid.
   */
  restore(options: QueryOptionsBase & Readonly<{ hooks?: boolean }> = {}): Promise<void> {
    return lifecycle.restore(this as unknown as AnyModel, options);
  }

  /**
   * Whether this instance of a paranoid model is soft-deleted.
   *
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   */
  isSoftDeleted(): boolean {
    return lifecycle.isSoftDeleted(this as unknown as AnyModel);
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
    await lifecycle.changeBy(
      this as unknown as AnyModel,
      'increment',
      fields as AttributeAmounts<Values>,
      options as Omit<IncrementOptions, 'where'>,
    );
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
    await lifecycle.changeBy(
      this as unknown as AnyModel,
      'decrement',
      fields as AttributeAmounts<Values>,
      options as Omit<IncrementOptions, 'where'>,
    );
    return this;
  }
}
