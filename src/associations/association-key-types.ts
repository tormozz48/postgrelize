import type { ModelStatic, AnyModel } from '../model/options.ts';
import type { AssociationName, AssociationThrough } from './types.ts';

type Model = ModelStatic<AnyModel>;

/** Keys resolved by a concrete association. */
export type AssociationKeyFields = Readonly<{
  /** Foreign key attribute. */
  foreignKey: string;
  /** Column of the foreign key. */
  identifierField: string;
  /** Source attribute referenced by the foreign key. */
  sourceKey: string;
  /** Target attribute referenced by the foreign key or by `otherKey`. */
  targetKey: string;
  /** Junction foreign key pointing at the target (belongsToMany). */
  otherKey: string | undefined;
  /** Junction model (belongsToMany). */
  through: AssociationThrough | undefined;
}>;

/** Model and key a foreign key attribute references, with the referential actions given. */
export type ReferenceSpec = Readonly<{
  /** Referenced model. */
  model: Model;
  /** Referenced attribute. */
  key: string;
  /** `ON DELETE` action given in the options. */
  onDelete: string | undefined;
  /** `ON UPDATE` action given in the options. */
  onUpdate: string | undefined;
  /** `constraints` option. */
  constraints: boolean | undefined;
}>;

/** Referential actions used when the options give none (`auto`: `SET NULL` when nullable). */
export type ReferenceDefaults = Readonly<{ onDelete: string; onUpdate: string }>;

/** Alias and keys of a hasOne / hasMany association. */
export type TargetKeys = Readonly<{
  /** Singular and plural alias forms. */
  name: AssociationName;
  /** Resolved keys. */
  keys: AssociationKeyFields;
}>;
