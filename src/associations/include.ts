import type { ModelDefinition } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { FindAttributeOptions } from '../model/select-query-builder.ts';
import type { Association } from './types.ts';

type Model = ModelStatic<AnyModel>;

/**
 * Options of the junction table of an included belongsToMany association.
 *
 * @example
 * ```ts
 * const through: IncludeThroughOptions = { attributes: ['role'], where: { role: 'owner' } };
 * const rows = await Project.findAll({ include: [{ model: User, through }] });
 * ```
 */
export type IncludeThroughOptions = Readonly<{
  /** Junction attributes to select (`[]` for none). Default: all. */
  attributes?: FindAttributeOptions;
  /** Filter on junction rows; see {@link WhereOptions}. */
  where?: unknown;
}>;

/**
 * One `include` entry (Sequelize v6 `IncludeOptions`): which association to load and how.
 *
 * Name the association with `model`, `as` or `association`. Eager loading uses JOINs (see the guide), except `separate`, which runs another query.
 *
 * @see {@link FindOptions}
 *
 * @example
 * ```ts
 * const opts: IncludeOptions = {
 *   model: Post,
 *   as: 'posts',
 *   where: { published: true },
 *   required: false,
 *   attributes: ['id', 'title'],
 *   include: [{ model: Tag }],
 * };
 * const users = await User.findAll({ include: [opts] });
 * ```
 */
export type IncludeOptions = Readonly<{
  /** Associated model; the association is looked up by model (and `as`). */
  model?: Model;
  /** Alias of the association, as given when it was defined. */
  as?: string;
  /** Association object or alias. */
  association?: Association | string;
  /** Filter on the included rows; makes the include required unless `required: false`. See {@link WhereOptions}. */
  where?: unknown;
  /**
   * Custom `ON` condition of the join; replaces the condition derived from the association keys.
   * Not used by belongsToMany includes (the junction joins keep their key conditions). See {@link WhereOptions}.
   */
  on?: unknown;
  /** `INNER JOIN` (true) or `LEFT OUTER JOIN` (false). */
  required?: boolean;
  /** Use `RIGHT OUTER JOIN`.
   * @defaultValue false */
  right?: boolean;
  /** Selected attributes. */
  attributes?: FindAttributeOptions;
  /** Nested includes. */
  include?: IncludeOption;
  /** Load a hasMany association with a separate query instead of a JOIN.
   * @defaultValue false */
  separate?: boolean;
  /** Junction options for belongsToMany. */
  through?: IncludeThroughOptions;
  /**
   * Fetch only the first `limit` rows per parent in the database (`JOIN LATERAL` over the parent
   * keys) instead of loading every child and trimming in memory. Needs `separate` and `limit`.
   * PostgreSQL extension.
   *
   * @postgrelize
   * @defaultValue false
   */
  lateral?: boolean;
  /** Order of a separate include. */
  order?: unknown;
  /** Maximum rows per include of a separate include. */
  limit?: number;
  /** For paranoid targets: `false` includes soft-deleted rows.
   * @defaultValue true */
  paranoid?: boolean;
  /** Include every association of the model (`{ all: true }`).
   * @defaultValue false */
  all?: boolean;
}>;

/**
 * One entry of the `include` option (Sequelize v6 `Includeable`): a model, an association (or its
 * alias), include options, or `{ all: true }` for every association of the model.
 *
 * @see {@link IncludeOptions}
 *
 * @example
 * ```ts
 * const entries: Includeable[] = [Post, 'profile', { model: Tag, required: false }, { all: true }];
 * const users = await User.findAll({ include: entries });
 * ```
 */
export type Includeable = Model | Association | string | IncludeOptions;

/** `include` option: one entry or a list of entries (Sequelize v6 `Includeable | Includeable[]`). */
export type IncludeOption = Includeable | readonly Includeable[];

/** Normalized include. */
export type IncludeNode = Readonly<{
  association: Association;
  model: Model;
  definition: ModelDefinition;
  as: string;
  alias: string;
  path: string;
  where: unknown;
  on: unknown;
  required: boolean;
  right: boolean;
  attributes: FindAttributeOptions | undefined;
  separate: boolean;
  lateral: boolean;
  paranoid: boolean;
  order: unknown;
  limit: number | undefined;
  through:
    | Readonly<{
        model: Model;
        definition: ModelDefinition;
        alias: string;
        path: string;
        attributes: FindAttributeOptions | undefined;
        where: unknown;
      }>
    | undefined;
  children: readonly IncludeNode[];
}>;
