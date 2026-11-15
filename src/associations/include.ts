import type { ModelDefinition } from '../model/definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { FindAttributeOptions } from '../model/query-builders.ts';
import type { Association } from './types.ts';

type Model = ModelStatic<AnyModel>;

/** Through-table options of an include. */
export type IncludeThroughOptions = Readonly<{
  /** Junction attributes to select (`[]` for none). */
  attributes?: FindAttributeOptions;
  /** Filter on junction rows. */
  where?: unknown;
}>;

/** One `include` entry (Sequelize v6 `IncludeOptions`). */
export type IncludeOptions = Readonly<{
  /** Associated model. */
  model?: Model;
  /** Alias of the association. */
  as?: string;
  /** Association object or alias. */
  association?: Association | string;
  /** Filter on the included rows; makes the include required unless `required: false`. */
  where?: unknown;
  /** `INNER JOIN` (true) or `LEFT OUTER JOIN` (false). */
  required?: boolean;
  /** `RIGHT OUTER JOIN`. */
  right?: boolean;
  /** Selected attributes. */
  attributes?: FindAttributeOptions;
  /** Nested includes. */
  include?: IncludeOption;
  /** Load a hasMany association with a separate query. */
  separate?: boolean;
  /** Junction options for belongsToMany. */
  through?: IncludeThroughOptions;
  /** Order of a separate include. */
  order?: unknown;
  /** Limit of a separate include. */
  limit?: number;
  /** For paranoid targets: `false` includes soft-deleted rows. */
  paranoid?: boolean;
  /** Include every association (`{ all: true }`). */
  all?: boolean;
}>;

/** `include` option: a model, an alias, include options, or a list of them. */
export type IncludeOption =
  | Model
  | string
  | IncludeOptions
  | readonly (Model | string | IncludeOptions)[];

/** Normalized include. */
export type IncludeNode = Readonly<{
  association: Association;
  model: Model;
  definition: ModelDefinition;
  as: string;
  alias: string;
  path: string;
  where: unknown;
  required: boolean;
  right: boolean;
  attributes: FindAttributeOptions | undefined;
  separate: boolean;
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
