import { BelongsTo } from '../../associations/belongs-to.ts';
import { BelongsToMany } from '../../associations/belongs-to-many.ts';
import { HasMany } from '../../associations/has-many.ts';
import { HasOne } from '../../associations/has-one.ts';
import type { Association } from '../../associations/association.ts';
import type { AssociationOptions, BelongsToManyOptions } from '../../associations/types.ts';
import { registry } from '../model-services.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import type { ModelConstructor } from './model-constructor.ts';

const assertModel = (source: Readonly<{ name: string }>, target: unknown, method: string): void => {
  const prototype = (target as { prototype?: object } | null | undefined)?.prototype;
  if (typeof target !== 'function' || prototype === undefined || !('getDataValue' in prototype)) {
    throw new Error(
      `${source.name}.${method} called with something that's not a subclass of Sequelize.Model`,
    );
  }
};

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
     * Associations of this model whose target is the given model.
     *
     * @param target - Target model.
     * @returns Matching associations.
     * @example
     * ```ts
     * const toPosts = User.getAssociations(Post);
     * ```
     */
    static getAssociations(target: { name: string }): Association[] {
      return Object.values(this.associations).filter(
        (association) => (association.target as { name: string }).name === target.name,
      );
    }

    /**
     * Association to `target` for an alias, or the one declared without alias when `alias` is not a string.
     *
     * @param target - Target model.
     * @param alias - Association alias.
     * @returns The association, or `null`.
     * @example
     * ```ts
     * const association = User.getAssociationForAlias(Post, 'posts');
     * ```
     */
    static getAssociationForAlias(
      target: { name: string },
      alias?: string | null | { plural?: string },
    ): Association | null {
      const verifies = (association: Association): boolean =>
        typeof alias === 'string'
          ? association.as === alias
          : alias?.plural === undefined
            ? !association.isAliased
            : association.as === alias.plural;
      return this.getAssociations(target).find(verifies) ?? null;
    }

    /**
     * Tells whether an association with this alias exists.
     *
     * @param alias - Association alias.
     * @returns True when the model has the association.
     * @example
     * ```ts
     * if (User.hasAlias('posts')) {}
     * ```
     */
    static hasAlias(alias: string): boolean {
      return Object.hasOwn(this.associations, alias);
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
    ): BelongsTo<M, T> {
      assertModel(this, target, 'belongsTo');
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
    ): HasOne<M, T> {
      assertModel(this, target, 'hasOne');
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
    ): HasMany<M, T> {
      assertModel(this, target, 'hasMany');
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
    ): BelongsToMany<M, T> {
      assertModel(this, target, 'belongsToMany');
      return new BelongsToMany(this, target, options);
    }
  };
};
