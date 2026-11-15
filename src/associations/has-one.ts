import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import type { AssociationOptions } from './types.ts';

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;

const keys = new AssociationKeys();

/** `source.hasOne(target)` (Sequelize v6 `HasOne`): the foreign key lives on the target. */
export class HasOne extends Association {
  /**
   * Adds the foreign key attribute to the target and registers the association.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   */
  constructor(source: Model, target: Model, options: AssociationOptions = {}) {
    const resolved = keys.targetKeys(false, source, target, options);
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
    const { target, foreignKey } = this;
    const value = instance.get(this.sourceKey);
    const current = (await target.findOne({
      ...this.passThrough(options),
      where: { [foreignKey]: value },
    } as never)) as Instance | null;
    const next =
      associated === null || associated === undefined
        ? null
        : typeof associated === 'object' && 'get' in (associated as object)
          ? (associated as Instance)
          : ((await target.findByPk(
              associated,
              this.passThrough(options) as never,
            )) as Instance | null);
    const targetPk = keys.primaryKey(target);
    if (current !== null && (next === null || current.get(targetPk) !== next.get(targetPk))) {
      current.set(foreignKey, null);
      await current.save({ ...this.passThrough(options), fields: [foreignKey] } as never);
    }
    if (next !== null) {
      next.set({ [foreignKey]: value, ...this.scope });
      await next.save(this.passThrough(options) as never);
    }
    return next;
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
}
