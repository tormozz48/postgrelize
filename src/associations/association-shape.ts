import type { AnyModel, ModelStatic } from '../model/options.ts';
import { AssociationAccessors } from './association-accessors.ts';
import type { AssociationKeyFields } from './association-key-types.ts';
import type {
  Association as AssociationFields,
  AssociationName,
  AssociationOptions,
  AssociationType,
} from './types.ts';

type Model = ModelStatic<AnyModel>;

/** Everything an association is built from. */
export type AssociationInit = Readonly<{
  type: AssociationType;
  source: Model;
  target: Model;
  options: AssociationOptions;
  name: AssociationName;
  keys: AssociationKeyFields;
}>;

/** Computes the public fields of an association from its definition. */
export class AssociationShape {
  readonly #accessors = new AssociationAccessors();

  /**
   * Public fields of an association.
   *
   * @param init - Kind, models, options, alias forms and resolved keys.
   * @returns Field values.
   */
  fields(init: AssociationInit): AssociationFields {
    const multi = init.type === 'HasMany' || init.type === 'BelongsToMany';
    return {
      ...init.keys,
      associationType: init.type,
      source: init.source,
      target: init.target,
      as: multi ? init.name.plural : init.name.singular,
      name: init.name,
      isAliased: init.options.as !== undefined,
      scope: init.options.scope,
      isSingleAssociation: !multi,
      isMultiAssociation: multi,
      accessors: this.#accessors.namesFor(init.type, init.name),
    };
  }
}
