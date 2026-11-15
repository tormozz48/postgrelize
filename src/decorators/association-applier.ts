import type { AssociationOptions, BelongsToManyOptions } from '../associations/types.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import { metadata, type AssociationSpec } from './model-metadata.ts';

type Model = ModelStatic<AnyModel>;

const references = (target: Model, referenced: Model): boolean =>
  referenced === target || referenced.prototype instanceof target;

/**
 * Applies the associations collected by decorators with the same `hasOne` / `hasMany` /
 * `belongsTo` / `belongsToMany` calls an application would write by hand.
 *
 * @internal
 */
export class AssociationApplier {
  /**
   * @param model - Model that owns the property the association was declared on.
   * @param spec - Collected association.
   */
  apply(model: Model, spec: AssociationSpec): void {
    const target = spec.target();
    const options = { as: spec.key, ...this.#keys(model, target, spec), ...spec.options };
    if (spec.kind === 'belongsToMany') {
      model.belongsToMany(target, {
        ...options,
        through: this.#through(spec),
      } as BelongsToManyOptions);
    } else {
      model[spec.kind](target, options as AssociationOptions);
    }
  }

  #through(spec: AssociationSpec): BelongsToManyOptions['through'] {
    const { through } = spec;
    return typeof through === 'function' ? through() : (through as never);
  }

  #keys(model: Model, target: Model, spec: AssociationSpec): AssociationOptions {
    switch (spec.kind) {
      case 'belongsTo':
        return this.#key('foreignKey', model, target);
      case 'belongsToMany':
        return this.#manyKeys(model, target, spec);
      default:
        return this.#key('foreignKey', target, model);
    }
  }

  #manyKeys(model: Model, target: Model, spec: AssociationSpec): Record<string, string> {
    const through = this.#through(spec);
    const junction = typeof through === 'object' && 'model' in through ? through.model : through;
    if (typeof junction !== 'function') {
      return {};
    }
    return {
      ...this.#key('foreignKey', junction as Model, model),
      ...this.#key('otherKey', junction as Model, target),
    };
  }

  #key(name: string, holder: Model, referenced: Model): Record<string, string> {
    const found = Object.entries(metadata.collect(holder).foreignKeys).find(([, getter]) =>
      references(getter(), referenced),
    );
    return found === undefined ? {} : { [name]: found[0] };
  }
}
