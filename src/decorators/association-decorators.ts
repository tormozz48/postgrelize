import type { AssociationOptions, BelongsToManyOptions } from '../associations/types.ts';
import { decorate } from './decorator-factory.ts';
import type { ModelPropertyDecorator } from './decorator-types.ts';
import type { AssociationSpec, ModelGetter } from './model-metadata.ts';

type Kind = AssociationSpec['kind'];

const association = (
  kind: Kind,
  target: ModelGetter,
  options: AssociationOptions = {},
  through?: AssociationSpec['through'],
): ModelPropertyDecorator =>
  decorate.forProperty((meta, key) => {
    meta.associations.push({
      kind,
      key,
      target,
      options,
      ...(through === undefined ? {} : { through }),
    });
  });

/**
 * Adds a `hasOne` association; the foreign key is on the target. The property name is the alias (`as`).
 * The foreign key is the attribute of the target marked with `@ForeignKey` for this model, unless
 * `options.foreignKey` is given.
 *
 * @param target - Function returning the associated model.
 * @param options - Association options (`foreignKey`, `onDelete`, …).
 * @returns An attribute decorator.
 * @example
 * ```ts
 * @HasOne(() => Profile) profile!: Profile;
 * ```
 */
export const HasOne = (target: ModelGetter, options?: AssociationOptions): ModelPropertyDecorator =>
  association('hasOne', target, options);

/**
 * Adds a `hasMany` association; the foreign key is on the target. The property name is the alias (`as`).
 *
 * @param target - Function returning the associated model.
 * @param options - Association options (`foreignKey`, `onDelete`, …).
 * @returns An attribute decorator.
 * @example
 * ```ts
 * @HasMany(() => Post) posts!: Post[];
 * ```
 */
export const HasMany = (
  target: ModelGetter,
  options?: AssociationOptions,
): ModelPropertyDecorator => association('hasMany', target, options);

/**
 * Adds a `belongsTo` association; the foreign key is on this model, marked with `@ForeignKey`
 * for the target unless `options.foreignKey` is given. The property name is the alias (`as`).
 *
 * @param target - Function returning the associated model.
 * @param options - Association options (`foreignKey`, `targetKey`, `onDelete`, …).
 * @returns An attribute decorator.
 * @example
 * ```ts
 * @ForeignKey(() => User) @Column(DataTypes.INTEGER) userId!: number;
 * @BelongsTo(() => User) user!: User;
 * ```
 */
export const BelongsTo = (
  target: ModelGetter,
  options?: AssociationOptions,
): ModelPropertyDecorator => association('belongsTo', target, options);

/**
 * Adds a `belongsToMany` association through a junction model. The junction model's `@ForeignKey`
 * attributes give `foreignKey` (to this model) and `otherKey` (to the target) unless `options` sets them.
 *
 * @param target - Function returning the associated model.
 * @param through - Junction table name, function returning the junction model, or `{ model, scope }`.
 * @param options - Association options (`foreignKey`, `otherKey`, …).
 * @returns An attribute decorator.
 * @example
 * ```ts
 * @BelongsToMany(() => Role, () => UserRole) roles!: Role[];
 * ```
 */
export const BelongsToMany = (
  target: ModelGetter,
  through: NonNullable<AssociationSpec['through']>,
  options?: Omit<BelongsToManyOptions, 'through'>,
): ModelPropertyDecorator => association('belongsToMany', target, options, through);
