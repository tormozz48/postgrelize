import { ModelRegistry } from '../model/model-registry.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import type { IncludeOptions } from './include.ts';
import type { Association } from './types.ts';

const registry = new ModelRegistry();

/**
 * The include through which `getXs` of a belongsToMany association joins the junction row to each
 * target (v6 `oneFromTarget`): a hasOne from the target to the junction, not registered on either.
 *
 * @internal
 */
export class JunctionInclude {
  entry(association: Association, where: unknown, options: Values): IncludeOptions {
    const given = options as Readonly<{
      joinTableAttributes?: readonly string[];
      through?: Readonly<{ paranoid?: boolean }>;
    }>;
    return {
      association: this.#hasOne(association),
      required: true,
      where,
      paranoid: given.through?.paranoid ?? true,
      ...(given.joinTableAttributes === undefined
        ? {}
        : { attributes: [...given.joinTableAttributes] }),
    };
  }

  #hasOne(association: Association): Association {
    const junction = (association.through as NonNullable<Association['through']>).model;
    const { name, primaryKeys } = registry.state(junction as ModelStatic<AnyModel>).definition;
    return {
      ...association,
      associationType: 'HasOne',
      source: association.target,
      target: junction,
      as: name,
      isAliased: true,
      isSingleAssociation: true,
      isMultiAssociation: false,
      foreignKey: association.otherKey as string,
      sourceKey: association.targetKey,
      targetKey: primaryKeys[0] ?? 'id',
      otherKey: undefined,
      through: undefined,
      scope: undefined,
    };
  }
}
