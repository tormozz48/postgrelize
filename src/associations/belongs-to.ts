import type { ModelAttributes } from '../model/definition.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { addAssociationAttributes } from '../model/state.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import type { AssociationOptions } from './types.ts';

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;

const keys = new AssociationKeys();

/** `source.belongsTo(target)` (Sequelize v6 `BelongsTo`): the foreign key lives on the source. */
export class BelongsTo extends Association {
  /**
   * Adds the foreign key attribute to the source and registers the association.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   */
  constructor(source: Model, target: Model, options: AssociationOptions = {}) {
    const name = keys.aliasNames(options.as, keys.modelName(target), false);
    const targetKey = options.targetKey ?? keys.primaryKey(target);
    const foreignKey =
      keys.foreignKeyName(options.foreignKey) ??
      keys.camelize(`${name.singular}_${keys.primaryKey(target)}`);
    addAssociationAttributes(source, {
      [foreignKey]: keys.keyAttribute(
        keys.attributeOf(target, targetKey),
        keys.foreignKeyExtras(options.foreignKey),
        keys.reference(
          {
            model: target,
            key: targetKey,
            onDelete: options.onDelete,
            onUpdate: options.onUpdate,
            constraints: options.constraints,
          },
          keys.foreignKeyExtras(options.foreignKey).allowNull !== false,
          {
            onDelete: 'auto',
            onUpdate: 'CASCADE',
          },
        ),
      ),
    } as ModelAttributes);
    super('BelongsTo', source, target, options, name, {
      foreignKey,
      identifierField: keys.fieldOf(source, foreignKey),
      sourceKey: foreignKey,
      targetKey,
      otherKey: undefined,
      through: undefined,
    });
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
   * @returns The source instance.
   */
  async set(
    instance: Instance,
    associated: unknown,
    options: AccessorOptions & Readonly<{ save?: boolean }> = {},
  ): Promise<Instance> {
    instance.set(
      this.foreignKey,
      associated === null ? null : this.keyOf(associated, this.targetKey),
    );
    if (options.save !== false) {
      await instance.save({ ...this.passThrough(options), fields: [this.foreignKey] } as never);
    }
    return instance;
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
