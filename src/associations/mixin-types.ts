// oxlint-disable typescript/no-explicit-any -- the Sequelize v6 mixin types are declared with `any` attributes.
import type { AnyModel, CreationAttributes } from '../model/options.ts';
import type {
  BulkCreateOptions,
  CreateOptions,
  InstanceDestroyOptions,
  InstanceUpdateOptions,
  SaveOptions,
} from '../model/options.ts';
import type { FindOptions } from '../model/find-options.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { FindAttributeOptions } from '../model/select-options.ts';
import type { WhereOptions } from '../model/types.ts';

/**
 * Attributes of a junction row (Sequelize v6 `JoinTableAttributes`).
 *
 * @example
 * ```ts
 * const through: JoinTableAttributes = { role: 'owner' };
 * ```
 */
export interface JoinTableAttributes {
  [attribute: string]: unknown;
}

/**
 * Options of the `getX` accessor of a belongsTo association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToGetAssociationMixinOptions = { scope: false, transaction };
 * ```
 */
export interface BelongsToGetAssociationMixinOptions extends FindOptions<any> {
  /** Scope to apply on the associated model, or `false` to remove its default scope. */
  scope?: string | string[] | boolean;
}

/**
 * Options of the `setX` accessor of a belongsTo association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToSetAssociationMixinOptions = { save: false };
 * ```
 */
export interface BelongsToSetAssociationMixinOptions extends SaveOptions<any> {
  /** Skip saving the source after setting the foreign key when `false`. */
  save?: boolean;
}

/**
 * Options of the `createX` accessor of a belongsTo association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToCreateAssociationMixinOptions = { save: true, transaction };
 * ```
 */
export interface BelongsToCreateAssociationMixinOptions
  extends CreateOptions<any>, BelongsToSetAssociationMixinOptions {}

/**
 * Options of the `getX` accessor of a hasOne association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasOneGetAssociationMixinOptions = { scope: false };
 * ```
 */
export interface HasOneGetAssociationMixinOptions extends FindOptions<any> {
  /** Scope to apply on the associated model, or `false` to remove its default scope. */
  scope?: string | string[] | boolean;
}

/**
 * Options of the `setX` accessor of a hasOne association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasOneSetAssociationMixinOptions = { save: false };
 * ```
 */
export interface HasOneSetAssociationMixinOptions
  extends HasOneGetAssociationMixinOptions, SaveOptions<any> {
  /** Skip saving the associated instance after setting the foreign key when `false`. */
  save?: boolean;
}

/**
 * Options of the `createX` accessor of a hasOne association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasOneCreateAssociationMixinOptions = { transaction };
 * ```
 */
export interface HasOneCreateAssociationMixinOptions
  extends HasOneSetAssociationMixinOptions, CreateOptions<any> {}

/**
 * Options of the `getXs` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyGetAssociationsMixinOptions = { where: { active: true }, scope: false };
 * ```
 */
export interface HasManyGetAssociationsMixinOptions extends FindOptions<any> {
  /** Scope to apply on the associated model, or `false` to remove its default scope. */
  scope?: string | string[] | boolean;
}

/**
 * Options of the `setXs` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManySetAssociationsMixinOptions = { transaction };
 * ```
 */
export interface HasManySetAssociationsMixinOptions
  extends FindOptions<any>, InstanceUpdateOptions<any> {}

/**
 * Options of the `addXs` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyAddAssociationsMixinOptions = { transaction };
 * ```
 */
export interface HasManyAddAssociationsMixinOptions extends InstanceUpdateOptions<any> {}

/**
 * Options of the `addX` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyAddAssociationMixinOptions = { transaction };
 * ```
 */
export interface HasManyAddAssociationMixinOptions extends InstanceUpdateOptions<any> {}

/**
 * Options of the `createX` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyCreateAssociationMixinOptions = { transaction };
 * ```
 */
export interface HasManyCreateAssociationMixinOptions extends CreateOptions<any> {}

/**
 * Options of the `removeX` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyRemoveAssociationMixinOptions = { transaction };
 * ```
 */
export interface HasManyRemoveAssociationMixinOptions extends InstanceUpdateOptions<any> {}

/**
 * Options of the `removeXs` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyRemoveAssociationsMixinOptions = { transaction };
 * ```
 */
export interface HasManyRemoveAssociationsMixinOptions extends InstanceUpdateOptions<any> {}

/**
 * Options of the `hasX` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyHasAssociationMixinOptions = { transaction };
 * ```
 */
export interface HasManyHasAssociationMixinOptions extends HasManyGetAssociationsMixinOptions {}

/**
 * Options of the `hasXs` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyHasAssociationsMixinOptions = { transaction };
 * ```
 */
export interface HasManyHasAssociationsMixinOptions extends HasManyGetAssociationsMixinOptions {}

/**
 * Options of the `countXs` accessor of a hasMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: HasManyCountAssociationsMixinOptions = { where: { active: true } };
 * ```
 */
export interface HasManyCountAssociationsMixinOptions extends QueryOptionsBase {
  /** Filter on the counted rows. */
  where?: WhereOptions<any>;
  /** Scope to apply on the associated model, or `false` to remove its default scope. */
  scope?: string | boolean;
}

/**
 * Options of the `getXs` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyGetAssociationsMixinOptions = { joinTableAttributes: [] };
 * ```
 */
export interface BelongsToManyGetAssociationsMixinOptions extends FindOptions<any> {
  /** Junction attributes to select. */
  joinTableAttributes?: FindAttributeOptions;
  /** Scope to apply on the associated model, or `false` to remove its default scope. */
  scope?: string | boolean;
}

/**
 * Options of the `setXs` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManySetAssociationsMixinOptions = { through: { role: 'owner' } };
 * ```
 */
export interface BelongsToManySetAssociationsMixinOptions
  extends
    FindOptions<any>,
    BulkCreateOptions<any>,
    InstanceUpdateOptions<any>,
    InstanceDestroyOptions {
  /** Attributes of the junction row. */
  through?: JoinTableAttributes;
}

/**
 * Options of the `addXs` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyAddAssociationsMixinOptions = { through: { role: 'member' } };
 * ```
 */
export interface BelongsToManyAddAssociationsMixinOptions
  extends
    FindOptions<any>,
    BulkCreateOptions<any>,
    InstanceUpdateOptions<any>,
    InstanceDestroyOptions {
  /** Attributes of the junction row. */
  through?: JoinTableAttributes;
}

/**
 * Options of the `addX` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyAddAssociationMixinOptions = { through: { role: 'member' } };
 * ```
 */
export interface BelongsToManyAddAssociationMixinOptions
  extends
    FindOptions<any>,
    BulkCreateOptions<any>,
    InstanceUpdateOptions<any>,
    InstanceDestroyOptions {
  /** Attributes of the junction row. */
  through?: JoinTableAttributes;
}

/**
 * Options of the `createX` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyCreateAssociationMixinOptions = { through: { role: 'member' } };
 * ```
 */
export interface BelongsToManyCreateAssociationMixinOptions extends CreateOptions<any> {
  /** Attributes of the junction row. */
  through?: JoinTableAttributes;
}

/**
 * Options of the `removeX` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyRemoveAssociationMixinOptions = { transaction };
 * ```
 */
export interface BelongsToManyRemoveAssociationMixinOptions extends InstanceDestroyOptions {}

/**
 * Options of the `removeXs` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyRemoveAssociationsMixinOptions = { transaction };
 * ```
 */
export interface BelongsToManyRemoveAssociationsMixinOptions extends InstanceDestroyOptions {}

/**
 * Options of the `hasX` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyHasAssociationMixinOptions = { transaction };
 * ```
 */
export interface BelongsToManyHasAssociationMixinOptions extends BelongsToManyGetAssociationsMixinOptions {}

/**
 * Options of the `hasXs` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyHasAssociationsMixinOptions = { transaction };
 * ```
 */
export interface BelongsToManyHasAssociationsMixinOptions extends BelongsToManyGetAssociationsMixinOptions {}

/**
 * Options of the `countXs` accessor of a belongsToMany association (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: BelongsToManyCountAssociationsMixinOptions = { where: { active: true } };
 * ```
 */
export interface BelongsToManyCountAssociationsMixinOptions extends QueryOptionsBase {
  /** Filter on the counted rows. */
  where?: WhereOptions<any>;
  /** Scope to apply on the associated model, or `false` to remove its default scope. */
  scope?: string | boolean;
}

/** Type of the `getX` accessor of a belongsTo association: `declare getClient: BelongsToGetAssociationMixin<Client>;` (Sequelize v6). */
export type BelongsToGetAssociationMixin<TModel> = (
  options?: BelongsToGetAssociationMixinOptions,
) => Promise<TModel>;

/** Type of the `setX` accessor of a belongsTo association (Sequelize v6). */
export type BelongsToSetAssociationMixin<TModel, TPrimaryKey> = (
  newAssociation?: TModel | TPrimaryKey,
  options?: BelongsToSetAssociationMixinOptions,
) => Promise<void>;

/** Type of the `createX` accessor of a belongsTo association (Sequelize v6). */
export type BelongsToCreateAssociationMixin<TModel extends AnyModel> = (
  values?: CreationAttributes<TModel>,
  options?: BelongsToCreateAssociationMixinOptions,
) => Promise<TModel>;

/** Type of the `getX` accessor of a hasOne association (Sequelize v6). */
export type HasOneGetAssociationMixin<TModel> = (
  options?: HasOneGetAssociationMixinOptions,
) => Promise<TModel>;

/** Type of the `setX` accessor of a hasOne association (Sequelize v6). */
export type HasOneSetAssociationMixin<TModel, TModelPrimaryKey> = (
  newAssociation?: TModel | TModelPrimaryKey,
  options?: HasOneSetAssociationMixinOptions,
) => Promise<void>;

/** Type of the `createX` accessor of a hasOne association (Sequelize v6). */
export type HasOneCreateAssociationMixin<TModel extends AnyModel> = (
  values?: CreationAttributes<TModel>,
  options?: HasOneCreateAssociationMixinOptions,
) => Promise<TModel>;

/** Type of the `getXs` accessor of a hasMany association: `declare getFiles: HasManyGetAssociationsMixin<File>;` (Sequelize v6). */
export type HasManyGetAssociationsMixin<TModel> = (
  options?: HasManyGetAssociationsMixinOptions,
) => Promise<TModel[]>;

/** Type of the `setXs` accessor of a hasMany association (Sequelize v6). */
export type HasManySetAssociationsMixin<TModel, TModelPrimaryKey> = (
  newAssociations?: (TModel | TModelPrimaryKey)[],
  options?: HasManySetAssociationsMixinOptions,
) => Promise<void>;

/** Type of the `addXs` accessor of a hasMany association (Sequelize v6). */
export type HasManyAddAssociationsMixin<TModel, TModelPrimaryKey> = (
  newAssociations?: (TModel | TModelPrimaryKey)[],
  options?: HasManyAddAssociationsMixinOptions,
) => Promise<void>;

/** Type of the `addX` accessor of a hasMany association (Sequelize v6). */
export type HasManyAddAssociationMixin<TModel, TModelPrimaryKey> = (
  newAssociation?: TModel | TModelPrimaryKey,
  options?: HasManyAddAssociationMixinOptions,
) => Promise<void>;

/** Type of the `createX` accessor of a hasMany association; the foreign key and scope attributes are filled in for you (Sequelize v6). */
export type HasManyCreateAssociationMixin<
  TModel extends AnyModel,
  TForeignKey extends keyof CreationAttributes<TModel> = never,
  TScope extends keyof CreationAttributes<TModel> = never,
> = (
  values?: Omit<CreationAttributes<TModel>, TForeignKey | TScope>,
  options?: HasManyCreateAssociationMixinOptions,
) => Promise<TModel>;

/** Type of the `removeX` accessor of a hasMany association (Sequelize v6). */
export type HasManyRemoveAssociationMixin<TModel, TModelPrimaryKey> = (
  oldAssociated?: TModel | TModelPrimaryKey,
  options?: HasManyRemoveAssociationMixinOptions,
) => Promise<void>;

/** Type of the `removeXs` accessor of a hasMany association (Sequelize v6). */
export type HasManyRemoveAssociationsMixin<TModel, TModelPrimaryKey> = (
  oldAssociateds?: (TModel | TModelPrimaryKey)[],
  options?: HasManyRemoveAssociationsMixinOptions,
) => Promise<void>;

/** Type of the `hasX` accessor of a hasMany association (Sequelize v6). */
export type HasManyHasAssociationMixin<TModel, TModelPrimaryKey> = (
  target: TModel | TModelPrimaryKey,
  options?: HasManyHasAssociationMixinOptions,
) => Promise<boolean>;

/** Type of the `hasXs` accessor of a hasMany association (Sequelize v6). */
export type HasManyHasAssociationsMixin<TModel, TModelPrimaryKey> = (
  targets: (TModel | TModelPrimaryKey)[],
  options?: HasManyHasAssociationsMixinOptions,
) => Promise<boolean>;

/** Type of the `countXs` accessor of a hasMany association (Sequelize v6). */
export type HasManyCountAssociationsMixin = (
  options?: HasManyCountAssociationsMixinOptions,
) => Promise<number>;

/** Type of the `getXs` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyGetAssociationsMixin<TModel> = (
  options?: BelongsToManyGetAssociationsMixinOptions,
) => Promise<TModel[]>;

/** Type of the `setXs` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManySetAssociationsMixin<TModel, TModelPrimaryKey> = (
  newAssociations?: (TModel | TModelPrimaryKey)[],
  options?: BelongsToManySetAssociationsMixinOptions,
) => Promise<void>;

/** Type of the `addXs` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyAddAssociationsMixin<TModel, TModelPrimaryKey> = (
  newAssociations?: (TModel | TModelPrimaryKey)[],
  options?: BelongsToManyAddAssociationsMixinOptions,
) => Promise<void>;

/** Type of the `addX` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyAddAssociationMixin<TModel, TModelPrimaryKey> = (
  newAssociation?: TModel | TModelPrimaryKey,
  options?: BelongsToManyAddAssociationMixinOptions,
) => Promise<void>;

/** Type of the `createX` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyCreateAssociationMixin<TModel extends AnyModel> = (
  values?: CreationAttributes<TModel>,
  options?: BelongsToManyCreateAssociationMixinOptions,
) => Promise<TModel>;

/** Type of the `removeX` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyRemoveAssociationMixin<TModel, TModelPrimaryKey> = (
  oldAssociated?: TModel | TModelPrimaryKey,
  options?: BelongsToManyRemoveAssociationMixinOptions,
) => Promise<void>;

/** Type of the `removeXs` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyRemoveAssociationsMixin<TModel, TModelPrimaryKey> = (
  oldAssociateds?: (TModel | TModelPrimaryKey)[],
  options?: BelongsToManyRemoveAssociationsMixinOptions,
) => Promise<void>;

/** Type of the `hasX` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyHasAssociationMixin<TModel, TModelPrimaryKey> = (
  target: TModel | TModelPrimaryKey,
  options?: BelongsToManyHasAssociationMixinOptions,
) => Promise<boolean>;

/** Type of the `hasXs` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyHasAssociationsMixin<TModel, TModelPrimaryKey> = (
  targets: (TModel | TModelPrimaryKey)[],
  options?: BelongsToManyHasAssociationsMixinOptions,
) => Promise<boolean>;

/** Type of the `countXs` accessor of a belongsToMany association (Sequelize v6). */
export type BelongsToManyCountAssociationsMixin = (
  options?: BelongsToManyCountAssociationsMixinOptions,
) => Promise<number>;
