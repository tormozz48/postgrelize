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
     * Adds a belongsTo association: the foreign key is stored on this model.
     *
     * @param target - Associated model.
     * @param options - Association options.
     * @returns The association.
     */
    static belongsTo<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options?: AssociationOptions,
    ): Association {
      return new BelongsTo(this, target, options);
    }

    /**
     * Adds a hasOne association: the foreign key is stored on the target.
     *
     * @param target - Associated model.
     * @param options - Association options.
     * @returns The association.
     */
    static hasOne<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options?: AssociationOptions,
    ): Association {
      return new HasOne(this, target, options);
    }

    /**
     * Adds a hasMany association: the foreign key is stored on the target.
     *
     * @param target - Associated model.
     * @param options - Association options.
     * @returns The association.
     */
    static hasMany<M extends AnyModel, T extends AnyModel>(
      this: ModelStatic<M>,
      target: ModelStatic<T>,
      options?: AssociationOptions,
    ): Association {
      return new HasMany(this, target, options);
    }

    /**
     * Adds a belongsToMany association through a junction model.
     *
     * @param target - Associated model.
     * @param options - Association options with `through`.
     * @returns The association.
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
