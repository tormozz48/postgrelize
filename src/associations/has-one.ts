import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import { OwnerKeys } from './owner-keys.ts';
import type { AssociationOptions } from './types.ts';

type Instance = AnyModel;

const keys = new AssociationKeys();
const ownerKeys = new OwnerKeys(keys);

/** `source.hasOne(target)` (Sequelize v6 `HasOne`): the foreign key lives on the target. */
export class HasOne<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> extends Association<S, T> {
  /**
   * Adds the foreign key attribute to the target and registers the association.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   */
  constructor(source: ModelStatic<S>, target: ModelStatic<T>, options: AssociationOptions = {}) {
    const resolved = ownerKeys.hasOneOrMany(false, source, target, options);
    super('HasOne', source, target, options, resolved.name, resolved.keys);
    this.install();
  }

  /**
   * Loads the associated instance (`getX`).
   *
   * @param instance - Source instance.
   * @param options - Find options.
   * @returns Associated instance, or `null`.
   */
  get(instance: Instance, options: AccessorOptions = {}): Promise<Instance | null> {
    return this.target.findOne({
      ...options,
      where: this.andWhere(options.where, this.scope, {
        [this.foreignKey]: instance.get(this.sourceKey),
      }),
    } as never);
  }

  /**
   * Makes `associated` the associated instance, unlinking the current one (`setX`).
   *
   * @param instance - Source instance.
   * @param associated - Instance, primary key value or `null`.
   * @param options - Query options.
   * @returns The new associated instance, or `null`.
   */
  async set(
    instance: Instance,
    associated: unknown,
    options: AccessorOptions = {},
  ): Promise<Instance | null> {
    const value = instance.get(this.sourceKey);
    const current = await this.#current(value, options);
    if (this.#isLinked(current, associated)) {
      return null;
    }
    await this.#unlink(current, options);
    if (associated === null || associated === undefined) {
      return null;
    }
    const next = this.#toInstance(associated);
    next.set({ [this.foreignKey]: value, ...this.scope });
    return (await next.save(this.passThrough(options) as never)) as Instance;
  }

  /**
   * Creates the associated instance linked to the source (`createX`).
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
      { ...values, ...this.scope, [this.foreignKey]: instance.get(this.sourceKey) } as never,
      this.passThrough(options) as never,
    );
  }

  async #current(value: unknown, options: AccessorOptions): Promise<Instance | null> {
    return (await this.target.findOne({
      ...this.passThrough(options),
      where: { [this.foreignKey]: value },
    } as never)) as Instance | null;
  }

  #isLinked(current: Instance | null, associated: unknown): boolean {
    if (current === null || associated === null || associated === undefined) {
      return false;
    }
    const pk = keys.primaryKey(this.target);
    const other = this.#isInstance(associated) ? associated.get(pk) : associated;
    return current.get(pk) === other;
  }

  #isInstance(value: unknown): value is Instance {
    return typeof value === 'object' && value !== null && 'get' in value;
  }

  #toInstance(associated: unknown): Instance {
    return this.#isInstance(associated)
      ? associated
      : (this.target.build({ [keys.primaryKey(this.target)]: associated } as never, {
          isNewRecord: false,
        }) as Instance);
  }

  async #unlink(current: Instance | null, options: AccessorOptions): Promise<void> {
    if (current !== null) {
      current.set(this.foreignKey, null);
      await current.save({ ...this.passThrough(options), fields: [this.foreignKey] } as never);
    }
  }
}
