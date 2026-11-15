import type { IndexOptions } from '../ddl/ddl-generator.ts';
import type { AttributeOptions, UniqueOptions } from '../model/attribute-options.ts';
import type { DataTypeInput } from '../data-types/data-types.ts';
import { decorate } from './decorator-factory.ts';
import type { ModelPropertyDecorator } from './decorator-types.ts';

/** Argument of `@Column`: a data type or column options. */
export type ColumnInput = DataTypeInput | AttributeOptions;

const isOptions = (input: ColumnInput): input is AttributeOptions =>
  typeof input === 'object' && 'type' in input && !('sqlType' in input);

/**
 * Declares a class field as a model attribute (a column).
 *
 * The type is not inferred from the TypeScript type (there is no `reflect-metadata`): pass a
 * `DataTypes` value or an options object with `type`. Combine with the shortcut decorators.
 *
 * @param input - A data type (`DataTypes.STRING(64)`) or column options (`{ type, allowNull, … }`).
 * @returns An attribute decorator.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @Column({ type: DataTypes.STRING, allowNull: false })
 *   name!: string;
 * }
 * ```
 */
export const Column = (input: ColumnInput): ModelPropertyDecorator =>
  decorate.column(isOptions(input) ? input : { type: input });

/**
 * Makes the attribute part of the primary key (`primaryKey: true`).
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @PrimaryKey
 *   @Column(DataTypes.INTEGER)
 *   id!: number;
 * }
 * ```
 */
export const PrimaryKey: ModelPropertyDecorator = decorate.column({ primaryKey: true });

/**
 * Generates the attribute from a sequence (`autoIncrement: true`).
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @PrimaryKey
 *   @AutoIncrement
 *   @Column(DataTypes.INTEGER)
 *   id!: number;
 * }
 * ```
 */
export const AutoIncrement: ModelPropertyDecorator = decorate.column({ autoIncrement: true });

/**
 * Sets `allowNull`. Usable bare (`@AllowNull`, meaning `true`) or called.
 *
 * @param allowNull - Whether `NULL` is allowed.
 * @defaultValue true
 * @returns An attribute decorator.
 * @example
 * ```ts
 * class User extends Model {
 *   @AllowNull(false)
 *   @Column(DataTypes.TEXT)
 *   name!: string;
 * }
 * ```
 */
export const AllowNull = decorate.optionalProperty<boolean, ModelPropertyDecorator>(
  (allowNull = true) => decorate.column({ allowNull }),
);

/**
 * Sets the default value of the attribute (`defaultValue`).
 *
 * @param value - A value, an expression, or `DataTypes.NOW` / `DataTypes.UUIDV4`.
 * @returns An attribute decorator.
 * @example
 * ```ts
 * class User extends Model {
 *   @Default(false)
 *   @Column(DataTypes.BOOLEAN)
 *   active!: boolean;
 * }
 * ```
 */
export const Default = (value: unknown): ModelPropertyDecorator =>
  decorate.column({ defaultValue: value });

/**
 * Adds a unique constraint (`unique`). Usable bare or with a constraint name or options.
 *
 * @param unique - Constraint name or `{ name, msg, nullsNotDistinct }`. Attributes sharing a name form a composite key.
 * @returns An attribute decorator.
 * @example
 * ```ts
 * class User extends Model {
 *   @Unique
 *   @Column(DataTypes.STRING)
 *   email!: string;
 * }
 * ```
 */
export const Unique = decorate.optionalProperty<string | UniqueOptions, ModelPropertyDecorator>(
  (unique = true as never) => decorate.column({ unique }),
);

/**
 * Sets the column comment (`comment`).
 *
 * @param text - Comment text.
 * @returns An attribute decorator.
 * @example
 * ```ts
 * class User extends Model {
 *   @Comment('Login name')
 *   @Column(DataTypes.STRING)
 *   login!: string;
 * }
 * ```
 */
export const Comment = (text: string): ModelPropertyDecorator => decorate.column({ comment: text });

/**
 * Adds the attribute to an index of the table (`indexes`). Usable bare, with an index name or
 * with index options; attributes sharing a name form one composite index.
 *
 * Hidden from the generated API reference on purpose: VitePress treats a page named `Index.md` as a
 * directory index (case-insensitive), so it is documented in the Decorators guide instead.
 *
 * @param index - Index name or index options (without `fields`).
 * @returns An attribute decorator.
 * @hidden
 * @example
 * ```ts
 * class User extends Model {
 *   @Index({ name: 'users_name_idx', using: 'btree' })
 *   @Column(DataTypes.STRING)
 *   name!: string;
 * }
 * ```
 */
export const Index = decorate.optionalProperty<
  string | Omit<IndexOptions, 'fields'>,
  ModelPropertyDecorator
>((index = {}) =>
  decorate.forProperty((meta, key) => {
    meta.indexes.push({ key, options: typeof index === 'string' ? { name: index } : index });
  }),
);
