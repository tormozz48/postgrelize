import type { AnyModel, ModelStatic } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { IncludeNode, IncludeOption, IncludeOptions } from './include.ts';
import { AssociationLookup } from './association-lookup.ts';
import type { Association } from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;
type Position = Readonly<{ alias: string; path: string }>;
type BaseNode = Omit<IncludeNode, 'alias' | 'path' | 'through' | 'children'>;

const isModel = (value: unknown): value is Model => typeof value === 'function';

const isAssociation = (value: object): value is Association => 'associationType' in value;

const toOptions = (item: Model | string | IncludeOptions): IncludeOptions =>
  isModel(item)
    ? { model: item }
    : typeof item === 'string'
      ? { association: item }
      : isAssociation(item)
        ? { association: item }
        : item;

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
    const conformed = { ...item, association, model, as: item.as ?? association.as };
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
      association: node.association,
      required: node.required,
      separate: node.separate,
      lateral: node.lateral,
      paranoid: node.paranoid,
      ...(node.where === undefined ? {} : { where: node.where }),
      ...(node.on === undefined ? {} : { on: node.on }),
      ...(node.attributes === undefined ? {} : { attributes: node.attributes }),
      ...(node.children.length === 0
        ? {}
        : { include: node.children.map((child) => this.toOptions(child)) }),
    };
  }

  #node(source: Model, unscoped: IncludeOptions, parent: Position): IncludeNode {
    const association = this.#lookup.resolve(source, unscoped);
    const item = this.#withTargetScope(unscoped, association.target);
    const position = {
      alias: parent.alias === '' ? association.as : `${parent.alias}->${association.as}`,
      path: parent.path === '' ? association.as : `${parent.path}.${association.as}`,
    };
    return {
      ...this.#base(association, item),
      ...position,
      through: this.#through(association, item, position),
      children: this.normalize(association.target, item.include, position.alias, position.path),
    };
  }

  #base(association: Association, item: IncludeOptions): BaseNode {
    return {
      association,
      model: association.target,
      definition: registry.state(association.target).definition,
      as: association.as,
      where: item.where,
      on: item.on,
      required: item.required ?? item.where !== undefined,
      right: item.right === true,
      attributes: item.attributes,
      separate: item.separate === true && association.associationType === 'HasMany',
      lateral: item.lateral === true,
      paranoid: item.paranoid !== false,
      order: item.order,
      limit: item.limit,
    };
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
      where: item.through?.where,
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
