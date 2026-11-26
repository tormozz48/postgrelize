import type { ValidateOptions } from './instance-lifecycle.ts';
import { lifecycle, registry } from './model-services.ts';
import type {
  AnyModel,
  AttributeAmounts,
  FindOptions,
  IncrementOptions,
  InstanceDestroyOptions,
  SaveOptions,
  Values,
} from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';
import type { UpdateValues } from './types.ts';
import type { Col, Fn } from '../expressions/call-expressions.ts';
import type { Literal } from '../expressions/methods.ts';

/**
 * Persistence of model instances: `save`, `validate`, `update`, `reload`, `destroy`, `restore`, `isSoftDeleted`, `increment`, `decrement`.
 *
 * @internal
 */
export class ModelInstancePersistence<TAttributes extends object = Values> {
  /** Current attribute values. */
  declare dataValues: TAttributes;

  /**
   * Inserts the instance when it is new, otherwise updates its changed attributes. Runs validation
   * and the `beforeValidate`/`afterValidate`, `beforeSave`/`afterSave` and `beforeCreate`/`beforeUpdate`
   * (and `after*`) hooks unless disabled in the options; updating an unchanged instance sends no query.
   *
   * @param options - Save options.
   * @returns This instance with values returned by the database.
   * @throws ValidationError when validation fails.
   * @throws UniqueConstraintError when a unique constraint is violated.
   * @throws ForeignKeyConstraintError when a foreign key constraint is violated.
   * @example
   * ```ts
   * const user = User.build({ email: 'ada@example.com' });
   * await user.save({ transaction });
   * ```
   */
  save(options: SaveOptions<TAttributes> = {}): Promise<this> {
    return lifecycle.save(
      this as unknown as AnyModel,
      options as SaveOptions,
    ) as unknown as Promise<this>;
  }

  /**
   * Runs the attribute validators and model validators without saving (Sequelize v6 `instance.validate()`).
   *
   * @param options - `hooks`, `skip`, `fields`.
   * @returns Resolves when valid.
   * @throws ValidationError with all failures.
   * @example
   * ```ts
   * await user.validate();
   * ```
   */
  validate(options: ValidateOptions = {}): Promise<void> {
    return lifecycle.validate(
      this as unknown as AnyModel,
      options,
    ) as Promise<unknown> as Promise<void>;
  }

  /**
   * Sets one attribute and saves the instance.
   *
   * @param key - Attribute name.
   * @param value - New value, or a `fn` / `col` / `literal` expression.
   * @param options - Save options.
   * @returns This instance.
   * @throws ValidationError when validation fails.
   * @example
   * ```ts
   * await user.update('email', 'ada@example.com');
   * ```
   */
  update<K extends keyof TAttributes>(
    key: K,
    value: TAttributes[K] | Fn | Col | Literal,
    options?: SaveOptions<TAttributes>,
  ): Promise<this>;
  /**
   * Sets values and saves the instance, same as {@link Model.set} followed by {@link Model.save}.
   *
   * @param values - New values.
   * @param options - Save options.
   * @returns This instance.
   * @throws ValidationError when validation fails.
   * @example
   * ```ts
   * await user.update({ email: 'ada@example.com' });
   * ```
   */
  update(values: UpdateValues<TAttributes>, options?: SaveOptions<TAttributes>): Promise<this>;

  async update(
    keyOrValues: PropertyKey | UpdateValues<TAttributes>,
    valueOrOptions?: unknown,
    maybeOptions?: SaveOptions<TAttributes>,
  ): Promise<this> {
    const single = typeof keyOrValues === 'string';
    const instance = this as unknown as AnyModel;
    const values = single ? { [keyOrValues]: valueOrOptions } : (keyOrValues as Values);
    const options = single
      ? maybeOptions
      : (valueOrOptions as SaveOptions<TAttributes> | undefined);
    const fields = options?.fields as readonly string[] | undefined;
    const changedBefore = ModelInstancePersistence.#changed(instance);
    ModelInstancePersistence.#assign(instance, values, fields);
    if (fields !== undefined || instance.isNewRecord) {
      return this.save(options);
    }
    const defaultFields = ModelInstancePersistence.#passed(instance, values, changedBefore);
    return this.save({ ...options, defaultFields } as SaveOptions<TAttributes>);
  }

  static #changed(instance: AnyModel): readonly string[] {
    const changed = instance.changed();
    return changed === false ? [] : changed;
  }

  // like v6, `update` saves the changed ones among the passed keys and the setters' side effects,
  // not what was already unsaved
  static #passed(
    instance: AnyModel,
    values: Values,
    changedBefore: readonly string[],
  ): readonly string[] {
    const given = Object.keys(values).filter((name) => values[name] !== undefined);
    return ModelInstancePersistence.#changed(instance).filter(
      (name) => given.includes(name) || !changedBefore.includes(name),
    );
  }

  // like v6, `undefined` values and attributes outside `options.fields` are not assigned
  static #assign(instance: AnyModel, values: Values, fields: readonly string[] | undefined): void {
    instance.set(
      Object.fromEntries(
        Object.entries(values).filter(
          ([name, value]) =>
            value !== undefined && ModelInstancePersistence.#listed(instance, fields, name),
        ),
      ),
    );
  }

  // v6 assigns only the `fields` attributes, except through a custom setter (it may write others)
  static #listed(instance: AnyModel, fields: readonly string[] | undefined, name: string): boolean {
    if (fields === undefined || fields.includes(name)) {
      return true;
    }
    const { definition } = registry.state(instance.constructor as never);
    return definition.attributes.get(name)?.set !== undefined;
  }

  /**
   * Re-reads the row from the database and replaces the instance values, discarding unsaved changes.
   * The row is read with `findOne` by primary key, so `include`, `attributes`, `paranoid`, `lock`,
   * scopes and the find hooks apply as in Sequelize v6 (a soft-deleted row needs `paranoid: false`).
   *
   * @param options - Find options; `where` is always the primary key of this instance.
   * @returns This instance.
   * @throws InstanceError when the row no longer exists.
   * @example
   * ```ts
   * await user.reload({ transaction });
   * await user.reload({ include: [Post], lock: transaction.LOCK.UPDATE });
   * ```
   */
  reload(options: FindOptions<TAttributes> = {}): Promise<this> {
    return lifecycle.reload(
      this as unknown as AnyModel,
      options as FindOptions,
    ) as unknown as Promise<this>;
  }

  /**
   * Deletes the row of this instance. For paranoid models it sets `deletedAt` instead, unless
   * `force: true`. Runs `beforeDestroy`/`afterDestroy` hooks unless `hooks: false`.
   *
   * @param options - Destroy options (`force`, `hooks`, query options).
   * @returns Resolves when deleted.
   * @example
   * ```ts
   * await user.destroy();
   * ```
   */
  destroy(options: InstanceDestroyOptions = {}): Promise<void> {
    // typed `Promise<void>` like v6; a soft delete resolves with the instance at run time, as in v6
    return lifecycle.destroy(this as unknown as AnyModel, options) as Promise<void>;
  }

  /**
   * Clears `deletedAt` of this soft-deleted instance of a paranoid model.
   *
   * @param options - Query options; `hooks: false` skips restore hooks.
   * @returns Resolves when restored.
   * @throws Error when the model is not paranoid.
   * @example
   * ```ts
   * await user.restore();
   * ```
   */
  restore(options: QueryOptionsBase & Readonly<{ hooks?: boolean }> = {}): Promise<void> {
    return lifecycle.restore(this as unknown as AnyModel, options) as unknown as Promise<void>;
  }

  /**
   * Whether this instance of a paranoid model is soft-deleted.
   *
   * @returns True when `deletedAt` is set.
   * @throws Error when the model is not paranoid.
   * @example
   * ```ts
   * if (user.isSoftDeleted()) {
   *   await user.restore();
   * }
   * ```
   */
  isSoftDeleted(): boolean {
    return lifecycle.isSoftDeleted(this as unknown as AnyModel);
  }

  /**
   * Increments numeric attributes of this row in the database (`SET x = x + by`). The instance values are
   * not reloaded; call {@link Model.reload} to read the new numbers.
   *
   * @param fields - Attribute name(s) or map of amounts.
   * @param options - `by` (default 1), `silent`, and query options.
   * @returns This instance.
   * @example
   * ```ts
   * await user.increment('loginCount');
   * await user.increment({ loginCount: 2, score: 10 });
   * ```
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
   * Decrements numeric attributes of this row in the database (`SET x = x - by`). The instance values are
   * not reloaded; call {@link Model.reload} to read the new numbers.
   *
   * @param fields - Attribute name(s) or map of amounts.
   * @param options - `by` (default 1), `silent`, and query options.
   * @returns This instance.
   * @example
   * ```ts
   * await user.decrement('credits', { by: 5 });
   * ```
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
