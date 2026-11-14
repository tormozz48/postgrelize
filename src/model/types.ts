import type {
  Cast,
  Col,
  Excluded,
  Exists,
  Fn,
  Json,
  Literal,
  SqlExpression,
  Subquery,
  Tuple,
  Where,
} from '../expressions/methods.ts';
import type { Op } from '../expressions/op.ts';

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

/** Options of {@link InferAttributes}. */
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

/** Expressions accepted in place of a value (`Excluded` only inside `onConflict`). */
export type SqlValue = Literal | Fn | Col | Cast | Excluded | Subquery | Tuple;

type Comparable<V> = V | SqlValue;

/** Operators applicable to an attribute of type `V`. */
export type WhereOperators<V = unknown> = {
  /** See `Op.eq`. */
  [Op.eq]?: Comparable<V> | null;
  /** See `Op.ne`. */
  [Op.ne]?: Comparable<V> | null;
  /** See `Op.is`. */
  [Op.is]?: boolean | null;
  /** See `Op.not`. */
  [Op.not]?: Comparable<V> | boolean | null | WhereOperators<V>;
  /** See `Op.gt`. */
  [Op.gt]?: Comparable<V> | AnyAll<V>;
  /** See `Op.gte`. */
  [Op.gte]?: Comparable<V> | AnyAll<V>;
  /** See `Op.lt`. */
  [Op.lt]?: Comparable<V> | AnyAll<V>;
  /** See `Op.lte`. */
  [Op.lte]?: Comparable<V> | AnyAll<V>;
  /** See `Op.in`. */
  [Op.in]?: readonly V[] | Literal | Subquery;
  /** See `Op.notIn`. */
  [Op.notIn]?: readonly V[] | Literal | Subquery;
  /** See `Op.between`. */
  [Op.between]?: readonly [Comparable<V>, Comparable<V>];
  /** See `Op.notBetween`. */
  [Op.notBetween]?: readonly [Comparable<V>, Comparable<V>];
  /** See `Op.like`. */
  [Op.like]?: string | SqlValue | AnyAll<string>;
  /** See `Op.notLike`. */
  [Op.notLike]?: string | SqlValue | AnyAll<string>;
  /** See `Op.iLike`. */
  [Op.iLike]?: string | SqlValue | AnyAll<string>;
  /** See `Op.notILike`. */
  [Op.notILike]?: string | SqlValue | AnyAll<string>;
  /** See `Op.startsWith`. */
  [Op.startsWith]?: string | SqlValue;
  /** See `Op.endsWith`. */
  [Op.endsWith]?: string | SqlValue;
  /** See `Op.substring`. */
  [Op.substring]?: string | SqlValue;
  /** See `Op.regexp`. */
  [Op.regexp]?: string | SqlValue;
  /** See `Op.notRegexp`. */
  [Op.notRegexp]?: string | SqlValue;
  /** See `Op.iRegexp`. */
  [Op.iRegexp]?: string | SqlValue;
  /** See `Op.notIRegexp`. */
  [Op.notIRegexp]?: string | SqlValue;
  /** See `Op.overlap`. */
  [Op.overlap]?: unknown;
  /** See `Op.contains`. */
  [Op.contains]?: unknown;
  /** See `Op.contained`. */
  [Op.contained]?: unknown;
  /** See `Op.adjacent`. */
  [Op.adjacent]?: unknown;
  /** See `Op.strictLeft`. */
  [Op.strictLeft]?: unknown;
  /** See `Op.strictRight`. */
  [Op.strictRight]?: unknown;
  /** See `Op.noExtendLeft`. */
  [Op.noExtendLeft]?: unknown;
  /** See `Op.noExtendRight`. */
  [Op.noExtendRight]?: unknown;
  /** See `Op.match`. */
  [Op.match]?: SqlValue;
  /** See `Op.col`. */
  [Op.col]?: string;
  /** See `Op.and`. */
  [Op.and]?: AllowArray<Comparable<V> | WhereOperators<V>>;
  /** See `Op.or`. */
  [Op.or]?: AllowArray<Comparable<V> | WhereOperators<V>>;
  /** See `Op.any`. */
  [Op.any]?: readonly V[] | Literal;
  /** See `Op.all`. */
  [Op.all]?: readonly V[] | Literal;
  /** See `Op.isDistinctFrom`. */
  [Op.isDistinctFrom]?: Comparable<V> | null;
  /** See `Op.isNotDistinctFrom`. */
  [Op.isNotDistinctFrom]?: Comparable<V> | null;
  /** See `Op.hasKey`. */
  [Op.hasKey]?: string;
  /** See `Op.hasAnyKeys`. */
  [Op.hasAnyKeys]?: readonly string[];
  /** See `Op.hasAllKeys`. */
  [Op.hasAllKeys]?: readonly string[];
};

/** `{ [Op.any]: values }` / `{ [Op.all]: values }` used with comparison operators. */
export type AnyAll<V> =
  | {
      /** `ANY (...)`. */
      [Op.any]: readonly V[] | ValuesList<V>;
    }
  | {
      /** `ALL (...)`. */
      [Op.all]: readonly V[] | ValuesList<V>;
    };

/** `{ [Op.values]: [...] }` — `VALUES (...)` list for `Op.any` / `Op.all`. */
export type ValuesList<V> = {
  /** Values. */
  [Op.values]: readonly V[];
};

/** Condition for one attribute: a value, a list of values (`IN`), operators, or an expression. */
export type WhereAttributeValue<V> =
  | Comparable<V>
  | null
  | readonly V[]
  | WhereOperators<V>
  | (V extends object ? Readonly<Record<string, unknown>> : never);

/** Logical combinators allowed at any level of a where object. */
export type WhereLogic<T> = {
  /** See `Op.and`. */
  [Op.and]?: AllowArray<WhereOptions<T>>;
  /** See `Op.or`. */
  [Op.or]?: AllowArray<WhereOptions<T>>;
  /** See `Op.not`. */
  [Op.not]?: WhereOptions<T>;
};

/** Where object keyed by attribute names, nested JSON paths (`'meta.a'`), casts (`'id::text'`) or included columns (`'$posts.title$'`). */
export type WhereAttributeHash<T> = { [K in keyof T]?: WhereAttributeValue<T[K]> } & {
  [key: `$${string}$` | `${string}.${string}` | `${string}::${string}`]: unknown;
} & WhereLogic<T>;

/** `where` option of queries (Sequelize v6 `WhereOptions`). */
export type WhereOptions<T = Record<string, unknown>> =
  | WhereAttributeHash<T>
  | readonly WhereOptions<T>[]
  | Where
  | Literal
  | Fn
  | Json
  | Exists;

/** Any expression builder value. */
export type Expression = SqlExpression;
