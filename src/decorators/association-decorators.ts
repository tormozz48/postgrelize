import type { BelongsTo as BelongsToAssociation } from '../associations/belongs-to.ts';
import type { BelongsToMany as BelongsToManyAssociation } from '../associations/belongs-to-many.ts';
import type { HasMany as HasManyAssociation } from '../associations/has-many.ts';
import type { HasOne as HasOneAssociation } from '../associations/has-one.ts';
import type { AssociationOptions, BelongsToManyOptions } from '../associations/types.ts';
import type { AnyModel } from '../model/options.ts';
import { decorate } from './decorator-factory.ts';
import type { ModelPropertyDecorator } from './decorator-types.ts';
import type { AssociationSpec, ModelGetter } from './model-metadata.ts';

type Kind = AssociationSpec['kind'];

// The v6 association classes share their names with these decorators, so the root exports the class
// types under the same names: `HasMany<S, T>` in a type position is the association, `@HasMany(...)` the decorator.

/** The association created by `Model.hasOne` (Sequelize v6 `HasOne` class type); the `@HasOne` decorator has the same name as a value. */
export type HasOne<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> = HasOneAssociation<S, T>;
/** The association created by `Model.hasMany` (Sequelize v6 `HasMany` class type); the `@HasMany` decorator has the same name as a value. */
export type HasMany<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> = HasManyAssociation<S, T>;
/** The association created by `Model.belongsTo` (Sequelize v6 `BelongsTo` class type); the `@BelongsTo` decorator has the same name as a value. */
export type BelongsTo<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> = BelongsToAssociation<S, T>;
/** The association created by `Model.belongsToMany` (Sequelize v6 `BelongsToMany` class type); the `@BelongsToMany` decorator has the same name as a value. */
export type BelongsToMany<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> = BelongsToManyAssociation<S, T>;

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
 * class User extends Model {
 *   @HasOne(() => Profile)
 *   profile!: Profile;
 * }
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
 * class User extends Model {
 *   @HasMany(() => Post)
 *   posts!: Post[];
 * }
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
 * class Post extends Model {
 *   @ForeignKey(() => User)
 *   @Column(DataTypes.INTEGER)
 *   userId!: number;
 *
 *   @BelongsTo(() => User)
 *   user!: User;
 * }
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
 * class Post extends Model {
 *   @BelongsToMany(() => Tag, 'post_tags')
 *   tags!: Tag[];
 * }
 * ```
 */
export const BelongsToMany = (
  target: ModelGetter,
  through: NonNullable<AssociationSpec['through']>,
  options?: Omit<BelongsToManyOptions, 'through'>,
): ModelPropertyDecorator => association('belongsToMany', target, options, through);
