import { Op } from '../expressions/op.ts';
import type { AnyModel, CountOptions, ModelStatic, Values } from '../model/options.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import { OwnerKeys } from './owner-keys.ts';
import type { AssociationOptions } from './types.ts';

type Instance = AnyModel;

const keys = new AssociationKeys();
const ownerKeys = new OwnerKeys(keys);

/** `source.hasMany(target)` (Sequelize v6 `HasMany`): the foreign key lives on the target. */
export class HasMany<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> extends Association<S, T> {
  readonly #targetPk: string;

  /**
   * Adds the foreign key attribute to the target and registers the association.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   */
  constructor(source: ModelStatic<S>, target: ModelStatic<T>, options: AssociationOptions = {}) {
    const resolved = ownerKeys.hasOneOrMany(true, source, target, options);
    super('HasMany', source, target, options, resolved.name, resolved.keys);
    this.#targetPk = keys.primaryKey(target);
    this.install();
  }

  /**
   * Loads the associated instances (`getXs`); given an array of source instances it loads the rows of all
   * of them with one query.
   *
   * @param instance - Source instance, or an array of them.
   * @param options - Find options.
   * @returns Associated instances; for an array, an object keyed by the source key value with the instances of each source.
   */
  get(
    instances: readonly Instance[],
    options?: AccessorOptions,
  ): Promise<Record<string, Instance[]>>;
  get(instance: Instance, options?: AccessorOptions): Promise<Instance[]>;
  get(
    instance: Instance | readonly Instance[],
    options: AccessorOptions = {},
  ): Promise<Instance[] | Record<string, Instance[]>> {
    if (Array.isArray(instance)) {
      return this.#getMany(instance as readonly Instance[], options);
    }
    return this.target.findAll({
      ...options,
      where: this.andWhere(options.where, this.scope, this.#own(instance as Instance)),
    } as never);
  }

  async #getMany(
    instances: readonly Instance[],
    options: AccessorOptions,
  ): Promise<Record<string, Instance[]>> {
    const values = instances.map((instance) => instance.get(this.sourceKey));
    const found = await this.target.findAll({
      ...options,
      where: this.andWhere(options.where, this.scope, { [this.foreignKey]: { [Op.in]: values } }),
    } as never);
    const result: Record<string, Instance[]> = {};
    for (const key of values) {
      result[String(key)] = [];
    }
    for (const row of found as readonly Instance[]) {
      result[String(row.get(this.foreignKey))]?.push(row);
    }
    return result;
  }

  /**
   * Counts the associated instances (`countXs`).
   *
   * @param instance - Source instance.
   * @param options - Count options.
   * @returns Number of associated rows.
   */
  count(instance: Instance, options: AccessorOptions = {}): Promise<number> {
    return this.target.count({
      ...options,
      where: this.andWhere(options.where, this.scope, this.#own(instance)),
    } as CountOptions);
  }

  /**
   * Checks whether all given instances are associated (`hasX` / `hasXs`).
   *
   * @param instance - Source instance.
   * @param item - Instance(s) or primary key value(s).
   * @param options - Query options.
   * @returns True when every item is associated.
   */
  async has(instance: Instance, item: unknown, options: AccessorOptions = {}): Promise<boolean> {
    const wanted = this.#ids(item);
    return (
      (await this.target.unscoped().count({
        ...this.passThrough(options),
        where: this.andWhere(this.scope, this.#own(instance), { [this.#targetPk]: wanted }),
      } as CountOptions)) === wanted.length
    );
  }

  /**
   * Links the given instances to the source (`addX` / `addXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or primary key value(s).
   * @param options - Query options.
   * @returns The source instance.
   */
  async add(instance: Instance, items: unknown, options: AccessorOptions = {}): Promise<Instance> {
    const wanted = this.#ids(items);
    if (wanted.length > 0) {
      await this.target
        .unscoped()
        .update(
          { ...this.#own(instance), ...this.scope } as never,
          { ...this.passThrough(options), where: { [this.#targetPk]: wanted } } as never,
        );
    }
    return instance;
  }

  /**
   * Unlinks the given instances (`removeX` / `removeXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or primary key value(s).
   * @param options - Query options.
   * @returns The source instance.
   */
  async remove(
    instance: Instance,
    items: unknown,
    options: AccessorOptions = {},
  ): Promise<Instance> {
    const wanted = this.#ids(items);
    if (wanted.length > 0) {
      await this.target.unscoped().update(
        { [this.foreignKey]: null } as never,
        {
          ...this.passThrough(options),
          where: this.andWhere(this.#own(instance), { [this.#targetPk]: wanted }),
        } as never,
      );
    }
    return instance;
  }

  /**
   * Replaces the associated instances (`setXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or primary key value(s).
   * @param options - Query options.
   * @returns The source instance.
   */
  async set(instance: Instance, items: unknown, options: AccessorOptions = {}): Promise<Instance> {
    const wanted = this.#ids(items);
    await this.#unlinkOthers(instance, wanted, options);
    if (wanted.length > 0) {
      await this.target
        .unscoped()
        .update(
          { ...this.#own(instance), ...this.scope } as never,
          { ...this.passThrough(options), where: { [this.#targetPk]: wanted } } as never,
        );
    }
    return instance;
  }

  /**
   * Creates an associated instance linked to the source (`createX`).
   *
   * @param instance - Source instance.
   * @param values - Values of the new instance.
   * @param options - Query options.
   * @returns The created instance.
   */
  create(
    instance: Instance,
    values: Values = {},
    options: AccessorOptions = {},
  ): Promise<Instance> {
    return this.target.create(
      { ...values, ...this.scope, ...this.#own(instance) } as never,
      this.passThrough(options) as never,
    );
  }

  async #unlinkOthers(
    instance: Instance,
    wanted: readonly unknown[],
    options: AccessorOptions,
  ): Promise<void> {
    await this.target.unscoped().update(
      { [this.foreignKey]: null } as never,
      {
        ...this.passThrough(options),
        where: this.andWhere(
          this.scope,
          this.#own(instance),
          wanted.length === 0 ? undefined : { [this.#targetPk]: { [Op.notIn]: wanted } },
        ),
      } as never,
    );
  }

  #own(instance: Instance): Values {
    return { [this.foreignKey]: instance.get(this.sourceKey) };
  }

  #ids(items: unknown): readonly unknown[] {
    return this.toArray(items).map((item) => this.keyOf(item, this.#targetPk));
  }
}
