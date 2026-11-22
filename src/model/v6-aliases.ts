import type { Col, Fn } from '../expressions/methods.ts';
import type { ColumnDescription } from '../query-interface/query-interface.ts';
import type { BindParameters, Replacements } from '../query/raw-query.ts';
import type { FindOptions, FindOrCreateOptions } from './find-options.ts';
import type { Model } from './model.ts';
import type { ModelStatic, Values } from './options.ts';

/**
 * A model class whose instances are `M` (Sequelize v6 `ModelCtor`, the old name of {@link ModelStatic}).
 *
 * @example
 * ```ts
 * const register = <M extends Model>(model: ModelCtor<M>): ModelCtor<M> => model;
 * ```
 */
// oxlint-disable-next-line typescript/no-explicit-any -- Sequelize v6 compat: `M` is constrained like `ModelStatic`.
export type ModelCtor<M extends Model<any, any>> = ModelStatic<M>;

/**
 * A model class with the given attribute and creation attribute types (Sequelize v6 `ModelDefined`),
 * the return type of `sequelize.define` in typed code.
 *
 * @example
 * ```ts
 * type UserModel = ModelDefined<{ id: number; name: string }, { name: string }>;
 * ```
 */
export type ModelDefined<S extends {}, T extends {}> = ModelStatic<Model<S, T>>;

/**
 * A no-argument model constructor with the given attribute types (Sequelize v6 `ModelType`).
 *
 * @example
 * ```ts
 * const factory: ModelType<{ id: number }> = class extends Model<{ id: number }> {};
 * ```
 */
export type ModelType<
  // oxlint-disable-next-line typescript/no-explicit-any -- Sequelize v6 compat: any attributes by default.
  TModelAttributes extends {} = any,
  TCreationAttributes extends {} = TModelAttributes,
> = new () => Model<TModelAttributes, TCreationAttributes>;

/**
 * {@link FindOptions} with a required `rejectOnEmpty` (Sequelize v6 `NonNullFindOptions`): the finder never resolves to `null`.
 *
 * @example
 * ```ts
 * const options: NonNullFindOptions<User> = { where: { id: 1 }, rejectOnEmpty: true };
 * const user = await User.findOne(options);
 * ```
 */
export type NonNullFindOptions<T = Values> = FindOptions<T> &
  Readonly<{
    /** Throw `EmptyResultError` (or the given error) when no row is found. */
    rejectOnEmpty: boolean | Error;
  }>;

/**
 * Options of `findOrBuild` (Sequelize v6 `FindOrBuildOptions`); the same as {@link FindOrCreateOptions}.
 *
 * @example
 * ```ts
 * const options: FindOrBuildOptions<User> = { where: { email: 'a@example.com' }, defaults: { name: 'Ann' } };
 * ```
 */
export type FindOrBuildOptions<T = Values> = FindOrCreateOptions<T>;

/** A primary key value (Sequelize v6 `Identifier`). */
export type Identifier = number | bigint | string | Buffer;

/**
 * Value of the `group` option (Sequelize v6 `GroupOption`): attribute names, `col()` or `fn()` expressions.
 *
 * @example
 * ```ts
 * const group: GroupOption = ['authorId', fn('date_trunc', 'day', col('createdAt'))];
 * ```
 */
export type GroupOption = string | Fn | Col | (string | Fn | Col)[];

/** Values of `replacements` or `bind` (Sequelize v6 `BindOrReplacements`). */
export type BindOrReplacements = Replacements | BindParameters;

/** Column descriptions by column name, as `describeTable` returns them (Sequelize v6 `ColumnsDescription`). */
export type ColumnsDescription = Record<string, ColumnDescription>;
