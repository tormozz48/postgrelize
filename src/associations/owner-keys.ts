import { inflector as inflection } from '../model/inflector.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { AssociationKeys, AssociationKeyFields, TargetKeys } from './association-keys.ts';
import type { AssociationOptions } from './types.ts';

type Model = ModelStatic<AnyModel>;

/** Resolves alias and keys of belongsTo / hasOne / hasMany and adds the foreign key attribute. */
export class OwnerKeys {
  readonly #keys: AssociationKeys;

  /**
   * @param keys - Naming and foreign key attribute rules.
   */
  constructor(keys: AssociationKeys) {
    this.#keys = keys;
  }

  /**
   * Resolves the alias and keys of a belongsTo association and adds the foreign key attribute
   * to the source.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   * @returns Alias forms and keys.
   */
  belongsTo(source: Model, target: Model, options: AssociationOptions): TargetKeys {
    const keys = this.#keys;
    const name = keys.aliasNames(options.as, keys.modelName(target), false);
    const targetKey = options.targetKey ?? keys.primaryKey(target);
    const foreignKey =
      keys.foreignKeyName(options.foreignKey) ??
      keys.camelize(`${name.singular}_${keys.primaryKey(target)}`);
    keys.addForeignKey(source, target, targetKey, foreignKey, options);
    return { name, keys: this.#fields(source, foreignKey, foreignKey, targetKey) };
  }

  /**
   * Resolves the alias and keys of a hasOne / hasMany association and adds the foreign key
   * attribute to the target.
   *
   * @param multi - True for hasMany.
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   * @returns Alias forms and keys.
   */
  hasOneOrMany(
    multi: boolean,
    source: Model,
    target: Model,
    options: AssociationOptions,
  ): TargetKeys {
    const keys = this.#keys;
    const sourceKey = options.sourceKey ?? keys.primaryKey(source);
    const foreignKey =
      keys.foreignKeyName(options.foreignKey) ??
      keys.camelize(`${this.#sourcePrefix(multi, source, options)}_${keys.primaryKey(source)}`);
    keys.addForeignKey(target, source, sourceKey, foreignKey, options);
    return {
      name: keys.aliasNames(options.as, keys.modelName(target), multi),
      keys: this.#fields(target, foreignKey, sourceKey, foreignKey),
    };
  }

  #fields(
    owner: Model,
    foreignKey: string,
    sourceKey: string,
    targetKey: string,
  ): AssociationKeyFields {
    const identifierField = this.#keys.fieldOf(owner, foreignKey);
    return {
      foreignKey,
      identifierField,
      sourceKey,
      targetKey,
      otherKey: undefined,
      through: undefined,
    };
  }

  #sourcePrefix(multi: boolean, source: Model, options: AssociationOptions): string {
    if (multi) return this.#keys.modelName(source).singular;
    return inflection.singularize(typeof options.as === 'string' ? options.as : source.modelName);
  }
}
