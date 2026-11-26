import type { DataTypeInput } from '../data-types/data-types.ts';
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

/**
 * Foreign key given as an object instead of a plain name.
 *
 * @example
 * ```ts
 * const fk: ForeignKeyOptions = { name: 'authorId', field: 'author_id', allowNull: false };
 * User.hasMany(Post, { foreignKey: fk });
 * ```
 */
export type ForeignKeyOptions = Readonly<{
  /** Attribute name. */
  name?: string;
  /** Column name. */
  field?: string;
  /** Whether the key may be `NULL`. */
  allowNull?: boolean;
  /** Default value of the foreign key attribute. */
  defaultValue?: unknown;
}>;

/**
 * Options shared by all association methods (Sequelize v6 `AssociationOptions`).
 *
 * Used by `hasOne`, `hasMany`, `belongsTo` and (extended) `belongsToMany`.
 *
 * @see {@link Model.hasMany}
 *
 * @example
 * ```ts
 * const opts: AssociationOptions = {
 *   as: 'posts',
 *   foreignKey: { name: 'authorId', allowNull: false },
 *   onDelete: 'CASCADE',
 * };
 * User.hasMany(Post, opts);
 * ```
 */
export type AssociationOptions = Readonly<{
  /** Alias: string, or `{ singular, plural }` for multi associations. Default: the target model name. */
  as?: string | AssociationName;
  /** Foreign key attribute name or options. */
  foreignKey?: string | ForeignKeyOptions;
  /** Attribute of the source referenced by the foreign key (hasOne / hasMany / belongsToMany). */
  sourceKey?: string;
  /** Attribute of the target referenced by the foreign key (belongsTo / belongsToMany). */
  targetKey?: string;
  /**
   * Data type of the generated foreign key (belongsTo / hasOne / hasMany).
   * @defaultValue the type of the referenced key
   */
  keyType?: DataTypeInput;
  /** Attribute values applied to associated rows (filter on read, values on write). */
  scope?: Readonly<Record<string, unknown>>;
  /** Create foreign key constraints on `sync()`.
   * @defaultValue true */
  constraints?: boolean;
  /** `ON DELETE` action of the foreign key constraint, e.g. `'CASCADE'`. */
  onDelete?: string;
  /** `ON UPDATE` action of the foreign key constraint, e.g. `'CASCADE'`. */
  onUpdate?: string;
  /**
   * Sequelize v6 `hooks` flag. With `onDelete: 'CASCADE'` and `hooks: true`, destroying an instance first
   * loads its associated rows and destroys each of them with its own hooks (`beforeDestroy`, `afterDestroy`),
   * then deletes the instance; without the flag PostgreSQL cascades the delete and no hooks of the target run.
   * Only a real delete cascades this way, not the soft delete of a paranoid model.
   */
  hooks?: boolean;
}>;

/**
 * Junction table of a belongsToMany association given as an object.
 *
 * @example
 * ```ts
 * const through: ThroughOptions = { model: 'ProjectTask', scope: { kind: 'member' } };
 * Project.belongsToMany(Task, { through });
 * ```
 */
export type ThroughOptions = Readonly<{
  /** Junction model, or the name of an implicit junction model to create. */
  model: string | ModelStatic<AnyModel>;
  /** Attribute values applied to junction rows. */
  scope?: Readonly<Record<string, unknown>>;
  /**
   * Soft deletes on a junction model created from a name.
   * @defaultValue false
   */
  paranoid?: boolean;
  /**
   * Whether the two foreign keys get a unique key when they do not become the primary key (the
   * junction model declares its own primary key, or has none). `false` allows repeated links.
   * @defaultValue true
   */
  unique?: boolean;
}>;

/**
 * Options of `belongsToMany`.
 *
 * Extends {@link AssociationOptions}; `foreignKey` is the junction column pointing at the source, `otherKey` the one pointing at the target.
 *
 * @see {@link Model.belongsToMany}
 *
 * @example
 * ```ts
 * const opts: BelongsToManyOptions = { through: 'ProjectTask', foreignKey: 'projectId', otherKey: 'taskId' };
 * Project.belongsToMany(Task, opts);
 * ```
 */
export type BelongsToManyOptions = AssociationOptions &
  Readonly<{
    /** Junction model, its name, or options. */
    through: string | ModelStatic<AnyModel> | ThroughOptions;
    /** Junction foreign key pointing at the target. Default: derived from the target model name. */
    otherKey?: string | ForeignKeyOptions;
    /**
     * Name of the unique key over the two foreign keys, see `through.unique`.
     * @defaultValue `<junction table>_<foreignKey>_<otherKey>_unique`
     */
    uniqueKey?: string;
    /**
     * `timestamps` of a junction model created from a name.
     * @defaultValue the `define` default, else true
     */
    timestamps?: boolean;
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
  /** Options the association was defined with. */
  options: AssociationOptions;
}>;
