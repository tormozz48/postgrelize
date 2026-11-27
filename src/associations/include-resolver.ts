import type { AnyModel, ModelStatic } from '../model/options.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { IncludeNode, IncludeOption, IncludeOptions } from './include.ts';
import { AssociationLookup } from './association-lookup.ts';
import type { Association } from './types.ts';

const registry = new ModelRegistry();
const attributeColumns = new AttributeColumns();

type Model = ModelStatic<AnyModel>;
type Position = Readonly<{ alias: string; path: string }>;
const KNOWN_INCLUDE_KEYS: ReadonlySet<string> = new Set([
  'model',
  'as',
  'association',
  'where',
  'on',
  'required',
  'right',
  'attributes',
  'include',
  'separate',
  'through',
  'lateral',
  'order',
  'limit',
  'paranoid',
  'all',
]);

const customOptions = (item: IncludeOptions): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !KNOWN_INCLUDE_KEYS.has(key)));

type BaseNode = Omit<IncludeNode, 'alias' | 'path' | 'through' | 'children'>;

const isModel = (value: unknown): value is Model => typeof value === 'function';

const isAssociation = (value: object): value is Association => 'associationType' in value;

const UNEXPECTED_INCLUDE =
  'Include unexpected. Element has to be either a Model, an Association or an object.';

const toOptions = (item: unknown): IncludeOptions => {
  if (isModel(item)) {
    return { model: item };
  }
  if (typeof item === 'string' && item !== '') {
    return { association: item };
  }
  if (typeof item === 'object' && item !== null) {
    if (isAssociation(item)) {
      return { association: item };
    }
    const options = item as IncludeOptions;
    if (options.association || options.model || options.all) {
      return options;
    }
  }
  throw new Error(UNEXPECTED_INCLUDE);
};

/**
 * Normalizes the `include` option into an include tree: resolves associations by model, alias or
 * association object, expands `{ all: true }` and injects the scope of the included model.
 */
export class IncludeResolver {
  readonly #lookup = new AssociationLookup();

  /**
   * Normalizes the `include` option of `source` into an include tree.
   *
   * @param source - Model the includes are resolved on.
   * @param option - `include` option.
   * @param parentAlias - Table alias of the parent include (`''` for the main model).
   * @param parentPath - Result path of the parent include (`''` for the main model).
   * @returns Include nodes.
   * @throws EagerLoadingError when a model is not associated to `source`.
   */
  normalize(
    source: Model,
    option: IncludeOption | undefined,
    parentAlias = '',
    parentPath = '',
  ): readonly IncludeNode[] {
    if (option === undefined) {
      return [];
    }
    const items = this.#lookup.expandAll(
      source,
      (Array.isArray(option) ? option : [option]).map(toOptions),
    );
    const parent = { alias: parentAlias, path: parentPath };
    return items.map((item) => this.#node(source, item, parent));
  }

  /**
   * Include entries the way v6 hands them to `beforeFindAfterExpandIncludeAll`: always a list of
   * option objects, `{ all: true }` expanded, and an `association` entry (object or alias) carrying
   * its `model` and `as`; nested includes are conformed too.
   *
   * @param source - Model the includes are resolved on.
   * @param option - `include` option.
   * @returns Conformed entries, or `undefined` without includes.
   * @throws EagerLoadingError when an alias is not an association of `source`.
   */
  conform(source: Model, option: IncludeOption | undefined): readonly IncludeOptions[] | undefined {
    if (option === undefined) {
      return undefined;
    }
    const items = this.#lookup.expandAll(
      source,
      (Array.isArray(option) ? option : [option]).map(toOptions),
    );
    return items.map((item) => this.#conformed(source, item));
  }

  #conformed(source: Model, item: IncludeOptions): IncludeOptions {
    if (item.association === undefined) {
      return item.model === undefined || item.include === undefined
        ? item
        : { ...item, include: this.conform(item.model, item.include) as IncludeOption };
    }
    const association = this.#lookup.resolve(source, item);
    const model = item.model ?? association.target;
    const conformed = { ...item, association, model, as: association.as };
    return item.include === undefined
      ? conformed
      : { ...conformed, include: this.conform(model, item.include) as IncludeOption };
  }

  /**
   * Converts an include node back to include options.
   *
   * @param node - Include node.
   * @returns Include options resolving to the same node.
   */
  toOptions(node: IncludeNode): IncludeOptions {
    return {
      ...node.custom,
      association: node.association,
      required: node.required,
      separate: node.separate,
      lateral: node.lateral,
      paranoid: node.paranoid,
      ...(node.where === undefined ? {} : { where: node.where }),
      ...(node.on === undefined ? {} : { on: node.on }),
      ...(node.attributes === undefined ? {} : { attributes: node.attributes }),
      ...(node.order === undefined ? {} : { order: node.order }),
      ...(node.limit === undefined ? {} : { limit: node.limit }),
      ...(node.children.length === 0
        ? {}
        : { include: node.children.map((child) => this.toOptions(child)) }),
    };
  }

  #node(source: Model, unscoped: IncludeOptions, parent: Position): IncludeNode {
    const association = this.#lookup.resolve(source, unscoped);
    const item = this.#withTargetScope(unscoped, association.target);
    // a `Model.schema()` copy given as `model` is queried in its schema, like v6
    const target =
      item.model !== undefined && registry.isSchemaCopy(item.model)
        ? item.model
        : association.target;
    const position = {
      alias: parent.alias === '' ? association.as : `${parent.alias}->${association.as}`,
      path: parent.path === '' ? association.as : `${parent.path}.${association.as}`,
    };
    return {
      ...this.#base(association, target, item),
      ...position,
      through: this.#through(association, item, position),
      children: this.normalize(target, item.include, position.alias, position.path),
    };
  }

  #base(association: Association, target: Model, item: IncludeOptions): BaseNode {
    return {
      association,
      model: target,
      definition: registry.state(target).definition,
      as: association.as,
      where: item.where,
      on: item.on,
      required: item.required ?? item.where !== undefined,
      right: item.right === true,
      attributes: item.attributes,
      separate: this.#separate(item, association),
      lateral: item.lateral === true,
      paranoid: item.paranoid !== false,
      order: item.order,
      limit: item.limit,
      custom: customOptions(item),
    };
  }

  // like v6, a hasMany include with a `limit` and no explicit `separate` is loaded separately
  #separate(item: IncludeOptions, association: Association): boolean {
    return (item.separate ?? item.limit !== undefined) && association.associationType === 'HasMany';
  }

  #through(
    association: Association,
    item: IncludeOptions,
    position: Position,
  ): IncludeNode['through'] {
    if (association.through === undefined) {
      return undefined;
    }
    const { model } = association.through;
    const definition = registry.state(model).definition;
    return {
      model,
      definition,
      alias: `${position.alias}->${definition.name}`,
      path: `${position.path}.${definition.name}`,
      attributes: item.through?.attributes,
      where: attributeColumns.paranoid(definition, item.through?.where, item.paranoid),
    };
  }

  /**
   * Merges the scope of the included model into the include options like Sequelize v6
   * `_injectScope`: a scoped class given as `model` brings its scopes, otherwise the target's
   * default scope applies. Include options win.
   */
  #withTargetScope(item: IncludeOptions, target: Model): IncludeOptions {
    const scoped = item.model ?? target;
    return registry
      .state(scoped)
      .scopes.inject(
        registry.activeScope(scoped),
        item as Readonly<Record<string, unknown>>,
      ) as IncludeOptions;
  }
}
