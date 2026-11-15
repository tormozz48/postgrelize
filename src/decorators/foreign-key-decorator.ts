import type { ForeignKey as ForeignKeyType } from '../model/types.ts';
import { decorate } from './decorator-factory.ts';
import type { ModelPropertyDecorator } from './decorator-types.ts';
import type { ModelGetter } from './model-metadata.ts';

/** Marks an attribute type as a foreign key, so it stays out of the creation attributes (Sequelize v6 `ForeignKey`). */
export type ForeignKey<T> = ForeignKeyType<T>;

/**
 * Marks the attribute as a foreign key to a model (also the v6 type `ForeignKey<T>` of the same name). Association decorators use it to find the
 * foreign key; it does not change the column definition.
 *
 * @param target - Function returning the referenced model.
 * @returns An attribute decorator.
 * @example
 * ```ts
 * class Post extends Model {
 *   @ForeignKey(() => User)
 *   @Column(DataTypes.INTEGER)
 *   userId!: number;
 * }
 * ```
 */
export const ForeignKey = (target: ModelGetter): ModelPropertyDecorator =>
  decorate.forProperty((meta, key) => {
    meta.foreignKeys[key] = target;
  });
