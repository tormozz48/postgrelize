import type { Col, Fn } from '../expressions/call-expressions.ts';
import type { Literal, SqlExpression } from '../expressions/methods.ts';

export type {
  AnyAll,
  SqlValue,
  ValuesList,
  WhereAttributeHash,
  WhereAttributeHashValue,
  WhereAttributeValue,
  WhereLogic,
  WhereOperators,
  WhereOptions,
} from './where-options.ts';

// Indexed through an object so a union of attribute interfaces is not distributed (as v6 does through `M['_attributes']`):
// the keys are the shared ones and a value is the union of the member values.
type UpdateShape<H extends { readonly values: unknown }> = {
  [K in keyof H['values']]?: H['values'][K] | Fn | Col | Literal;
};

/** New attribute values of an `update`: each attribute takes its own type or a `fn` / `col` / `literal` expression. */
export type UpdateValues<A> = UpdateShape<{ readonly values: A }>;

declare const CreationAttributeBrand: unique symbol;
declare const NonAttributeBrand: unique symbol;
declare const ForeignKeyBrand: unique symbol;

/**
 * Marks an attribute as optional on creation (e.g. auto-increment ids, defaults).
 * Same semantics as Sequelize v6 `CreationOptional`.
 */
export type CreationOptional<T> = T extends null | undefined ? T : T & CreationOptionalBrand;

/** Marks a class property as not being a model attribute (Sequelize v6 `NonAttribute`). */
export type NonAttribute<T> = T extends null | undefined ? T : T & NonAttributeBrandType;

/** Marks an attribute as a foreign key (Sequelize v6 `ForeignKey`). */
export type ForeignKey<T> = T extends null | undefined ? T : T & ForeignKeyBrandType;

/** Type brand of {@link CreationOptional}. */
export type CreationOptionalBrand = {
  /** Brand marker. */
  [CreationAttributeBrand]?: true;
};

/** Type brand of {@link NonAttribute}. */
export type NonAttributeBrandType = {
  /** Brand marker. */
  [NonAttributeBrand]?: true;
};

/** Type brand of {@link ForeignKey}. */
export type ForeignKeyBrandType = {
  /** Brand marker. */
  [ForeignKeyBrand]?: true;
};

type IsBranded<T, Brand extends symbol> = [Extract<keyof NonNullable<T>, Brand>] extends [never]
  ? false
  : true;

// oxlint-disable-next-line typescript/no-explicit-any -- matches any function signature
type AnyFunction = (...args: any[]) => unknown;

/**
 * Options of {@link InferAttributes}.
 *
 * @example
 * ```ts
 * type UserAttributes = InferAttributes<User, { omit: 'posts' }>;
 * ```
 */
export type InferAttributesOptions<OmittedKeys> = Readonly<{
  /** Attribute names to leave out. */
  omit?: OmittedKeys;
}>;

type AttributeKey<M, K extends keyof M, OmittedKeys> = K extends keyof ModelBase
  ? never
  : K extends OmittedKeys
    ? never
    : M[K] extends AnyFunction
      ? never
      : IsBranded<M[K], typeof NonAttributeBrand> extends true
        ? never
        : K;

/** Base instance members that are never attributes. */
export type ModelBase = Readonly<{
  /** Current values. */
  dataValues: unknown;
  /** Values as of the last load/save. */
  _previousDataValues: unknown;
  /** Phantom attribute type. */
  _attributes: unknown;
  /** Phantom creation attribute type. */
  _creationAttributes: unknown;
  /** Model class. */
  _model: unknown;
  /** Unsaved flag. */
  isNewRecord: unknown;
  /** Owning `Sequelize` instance. */
  sequelize: unknown;
  /** Insert/update flag of `onConflict` results. */
  wasInserted: unknown;
  /** Pre-statement values of `returningOld` results. */
  oldValues: unknown;
}>;

/** Infers attribute types from a model class declaration (Sequelize v6 `InferAttributes`). */
export type InferAttributes<
  M,
  Options extends InferAttributesOptions<keyof M | never> = InferAttributesOptions<never>,
> = {
  [K in keyof M as AttributeKey<M, K, Options['omit']>]: M[K];
};

/** Infers creation attribute types; `CreationOptional` attributes may be `undefined` (Sequelize v6 `InferCreationAttributes`). */
export type InferCreationAttributes<
  M,
  Options extends InferAttributesOptions<keyof M | never> = InferAttributesOptions<never>,
> = {
  [K in keyof M as AttributeKey<M, K, Options['omit']>]: IsBranded<
    M[K],
    typeof CreationAttributeBrand
  > extends true
    ? M[K] | undefined
    : M[K];
};

/** Makes the given keys of `T` optional (Sequelize v6 `Optional`). */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Makes nullable attributes optional (Sequelize v6 `MakeNullishOptional`). */
export type MakeNullishOptional<T> = {
  [K in keyof T as null extends T[K] ? never : undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as null extends T[K] ? K : undefined extends T[K] ? K : never]?: T[K];
};

/** A value or an array of values. */
export type AllowArray<T> = T | readonly T[];

/** Any expression builder value. */
export type Expression = SqlExpression;
