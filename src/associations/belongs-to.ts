import { Op } from '../expressions/op.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import { OwnerKeys } from './owner-keys.ts';
import type { AssociationOptions } from './types.ts';

type Instance = AnyModel;

const ownerKeys = new OwnerKeys(new AssociationKeys());

/** `source.belongsTo(target)` (Sequelize v6 `BelongsTo`): the foreign key lives on the source. */
export class BelongsTo<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> extends Association<S, T> {
  /**
   * Adds the foreign key attribute to the source and registers the association.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   */
  constructor(source: ModelStatic<S>, target: ModelStatic<T>, options: AssociationOptions = {}) {
    const resolved = ownerKeys.belongsTo(source, target, options);
    super('BelongsTo', source, target, options, resolved.name, resolved.keys);
    this.install();
  }

  /**
   * Loads the associated instance (`getX`); given an array of source instances it loads all of them with one query.
   *
   * @param instance - Source instance, or an array of them.
   * @param options - Find options.
   * @returns Associated instance, or `null`; for an array, an object keyed by foreign key value (`'null'` for missing keys) with the instance or `null`.
   */
  get(
    instances: readonly Instance[],
    options?: AccessorOptions,
  ): Promise<Record<string, Instance | null>>;
  get(instance: Instance, options?: AccessorOptions): Promise<Instance | null>;
  get(
    instance: Instance | readonly Instance[],
    options: AccessorOptions = {},
  ): Promise<Instance | null | Record<string, Instance | null>> {
    if (Array.isArray(instance)) {
      return this.#getMany(instance as readonly Instance[], options);
    }
    return this.#getOne(instance as Instance, options);
  }

  async #getMany(
    instances: readonly Instance[],
    options: AccessorOptions,
  ): Promise<Record<string, Instance | null>> {
    const keys = instances.map((instance) => instance.get(this.foreignKey));
    const found = await this.target.findAll({
      ...options,
      where: this.andWhere(options.where, this.scope, { [this.targetKey]: { [Op.in]: keys } }),
    } as never);
    const result: Record<string, Instance | null> = {};
    for (const key of keys) {
      result[String(key)] = null;
    }
    for (const row of found as readonly Instance[]) {
      result[String(row.get(this.targetKey))] = row;
    }
    return result;
  }

  #getOne(instance: Instance, options: AccessorOptions): Promise<Instance | null> {
    const value = instance.get(this.foreignKey);
    return value === null || value === undefined
      ? Promise.resolve(null)
      : this.target.findOne({
          ...options,
          where: this.andWhere(options.where, this.scope, { [this.targetKey]: value }),
        } as never);
  }

  /**
   * Points the foreign key at `associated` and saves the source (`setX`).
   *
   * @param instance - Source instance.
   * @param associated - Instance, key value or `null`.
   * @param options - Query options; `save: false` skips saving.
   * @returns The saved source instance, or `undefined` with `save: false` (like v6).
   */
  async set(
    instance: Instance,
    associated: unknown,
    options: AccessorOptions & Readonly<{ save?: boolean }> = {},
  ): Promise<Instance | undefined> {
    instance.set(
      this.foreignKey,
      associated === null ? null : this.keyOf(associated, this.targetKey),
    );
    if (options.save === false) {
      return undefined;
    }
    return (await instance.save({
      ...this.passThrough(options),
      fields: [this.foreignKey],
    } as never)) as Instance;
  }

  /**
   * Creates the associated instance and points the foreign key at it (`createX`).
   *
   * @param instance - Source instance.
   * @param values - Values of the new instance.
   * @param options - Query options.
   * @returns The created instance.
   */
  async create(
    instance: Instance,
    values: Values = {},
    options: AccessorOptions = {},
  ): Promise<Instance> {
    const created = await this.target.create(
      { ...values, ...this.scope } as never,
      this.passThrough(options) as never,
    );
    instance.set(this.foreignKey, created.get(this.targetKey));
    await instance.save({ ...this.passThrough(options), fields: [this.foreignKey] } as never);
    return created;
  }
}
