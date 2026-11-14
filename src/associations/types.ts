import type { AnyModel, ModelStatic } from '../model/options.ts';

/** Kind of association (Sequelize v6 `associationType`). */
export type AssociationType = 'BelongsTo' | 'HasOne' | 'HasMany' | 'BelongsToMany';

/** Singular and plural names of an association alias. */
export type AssociationName = Readonly<{
  /** Singular form, used by single-item accessors (`addPost`). */
  singular: string;
  /** Plural form, used by multi-item accessors (`getPosts`). */
  plural: string;
}>;

/** Foreign key given as an object. */
export type ForeignKeyOptions = Readonly<{
  /** Attribute name. */
  name?: string;
  /** Column name. */
  field?: string;
  /** Whether the key may be `NULL`. */
  allowNull?: boolean;
}>;

/** Options shared by all association methods (Sequelize v6 `AssociationOptions`). */
export type AssociationOptions = Readonly<{
  /** Alias: string, or `{ singular, plural }` for multi associations. */
  as?: string | AssociationName;
  /** Foreign key attribute name or options. */
  foreignKey?: string | ForeignKeyOptions;
  /** Attribute of the source referenced by the foreign key (hasOne / hasMany / belongsToMany). */
  sourceKey?: string;
  /** Attribute of the target referenced by the foreign key (belongsTo / belongsToMany). */
  targetKey?: string;
  /** Attribute values applied to associated rows (filter on read, values on write). */
  scope?: Readonly<Record<string, unknown>>;
  /** Create foreign key constraints on sync (M5). */
  constraints?: boolean;
  /** `ON DELETE` action of the foreign key constraint. */
  onDelete?: string;
  /** `ON UPDATE` action of the foreign key constraint. */
  onUpdate?: string;
}>;

/** Junction table of a belongsToMany association. */
export type ThroughOptions = Readonly<{
  /** Junction model, or the name of an implicit junction model to create. */
  model: string | ModelStatic<AnyModel>;
  /** Attribute values applied to junction rows. */
  scope?: Readonly<Record<string, unknown>>;
}>;

/** Options of `belongsToMany`. */
export type BelongsToManyOptions = AssociationOptions &
  Readonly<{
    /** Junction model, its name, or options. */
    through: string | ModelStatic<AnyModel> | ThroughOptions;
    /** Junction foreign key pointing at the target. */
    otherKey?: string | ForeignKeyOptions;
  }>;

/** Resolved junction of a belongsToMany association. */
export type AssociationThrough = Readonly<{
  /** Junction model. */
  model: ModelStatic<AnyModel>;
  /** Attribute values applied to junction rows. */
  scope?: Readonly<Record<string, unknown>>;
}>;

/** Association between two models (Sequelize v6 association object). */
export type Association = Readonly<{
  /** Kind of association. */
  associationType: AssociationType;
  /** Model the association is defined on. */
  source: ModelStatic<AnyModel>;
  /** Associated model. */
  target: ModelStatic<AnyModel>;
  /** Alias used in `include` and as the instance property. */
  as: string;
  /** Singular and plural alias forms. */
  name: AssociationName;
  /** Whether `as` was given explicitly. */
  isAliased: boolean;
  /** Foreign key attribute (on the source for belongsTo, on the target for hasOne/hasMany, on the junction for belongsToMany). */
  foreignKey: string;
  /** Column of the foreign key. */
  identifierField: string;
  /** Source attribute referenced by the foreign key. */
  sourceKey: string;
  /** Target attribute referenced by the foreign key (belongsTo) or by `otherKey` (belongsToMany). */
  targetKey: string;
  /** Junction foreign key pointing at the target (belongsToMany). */
  otherKey: string | undefined;
  /** Junction model (belongsToMany). */
  through: AssociationThrough | undefined;
  /** Association scope. */
  scope: Readonly<Record<string, unknown>> | undefined;
  /** True for belongsTo / hasOne. */
  isSingleAssociation: boolean;
  /** True for hasMany / belongsToMany. */
  isMultiAssociation: boolean;
  /** Names of the instance methods added to the source model. */
  accessors: Readonly<Record<string, string>>;
}>;
