import { BelongsTo } from '../../associations/belongs-to.ts';
import { BelongsToMany } from '../../associations/belongs-to-many.ts';
import { HasMany } from '../../associations/has-many.ts';
import { HasOne } from '../../associations/has-one.ts';
import type {
  Association,
  AssociationOptions,
  BelongsToManyOptions,
} from '../../associations/types.ts';
import { registry } from '../model-services.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Association statics of `Model`: `associations`, `belongsTo`, `hasOne`, `hasMany`, `belongsToMany`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelAssociations = <TBase extends ModelConstructor>(Base: TBase) => {
  return class AssociationsCapability extends Base {
    /** Associations of the model by alias (Sequelize v6 `Model.associations`). */
    static get associations(): Readonly<Record<string, Association>> {
      return Object.fromEntries(
        registry.state(this).associations as ReadonlyMap<string, Association>,
      );
    }

    /**
     * Declares that each row of this model refers to one row of the target; the foreign key column
     * lives on this model's table. Adds accessors such as `getX` / `setX` / `createX` to instances.
     *
     * @param this - The source model class.
     * @param target - Associated model.
     * @param options - Association options.
     * @returns The association.
     * @example
     * ```ts
     * Post.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
     * ```
     * @see [Associations guide](/guide/associations)
     */
    static belongsTo<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options?: AssociationOptions,
    ): Association {
      return new BelongsTo(this, target, options);
    }

    /**
     * Declares that each row of this model has at most one related target row; the foreign key column
     * lives on the target's table.
     *
     * @param this - The source model class.
     * @param target - Associated model.
     * @param options - Association options.
     * @returns The association.
     * @example
     * ```ts
     * User.hasOne(Profile, { foreignKey: 'userId' });
     * ```
     */
    static hasOne<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options?: AssociationOptions,
    ): Association {
      return new HasOne(this, target, options);
    }

    /**
     * Declares that each row of this model has many related target rows; the foreign key column
     * lives on the target's table.
     *
     * @param this - The source model class.
     * @param target - Associated model.
     * @param options - Association options.
     * @returns The association.
     * @example
     * ```ts
     * User.hasMany(Post, { foreignKey: 'authorId', as: 'posts' });
     * ```
     */
    static hasMany<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options?: AssociationOptions,
    ): Association {
      return new HasMany(this, target, options);
    }

    /**
     * Declares a many-to-many relation between this model and the target through a junction table.
     *
     * @param this - The source model class.
     * @param target - Associated model.
     * @param options - Association options with `through`.
     * @returns The association.
     * @example
     * ```ts
     * Project.belongsToMany(Task, { through: 'ProjectTasks' });
     * ```
     */
    static belongsToMany<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options: BelongsToManyOptions,
    ): Association {
      return new BelongsToMany(this, target, options);
    }
  };
};
