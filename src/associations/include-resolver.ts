import { EagerLoadingError } from '../errors/errors.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import { injectScope } from '../model/scopes.ts';
import { activeScope, stateOf } from '../model/state.ts';
import type { IncludeNode, IncludeOption, IncludeOptions } from './include.ts';
import type { Association } from './types.ts';

type Model = ModelStatic<AnyModel>;

const isModel = (value: unknown): value is Model => typeof value === 'function';

const sameModel = (left: Model, right: Model): boolean => stateOf(left) === stateOf(right);

const toOptions = (item: Model | string | IncludeOptions): IncludeOptions =>
  isModel(item) ? { model: item } : typeof item === 'string' ? { association: item } : item;

/**
 * Normalizes the `include` option into an include tree: resolves associations by model, alias or
 * association object, expands `{ all: true }` and injects the scope of the included model.
 */
export class IncludeResolver {
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
    const items = this.#expandAll(
      source,
      (Array.isArray(option) ? option : [option]).map(toOptions),
    );
    return items.map((unscoped) => {
      const association = this.#resolveAssociation(source, unscoped);
      const model = association.target;
      const item = this.#withTargetScope(unscoped, model);
      const alias = parentAlias === '' ? association.as : `${parentAlias}->${association.as}`;
      const path = parentPath === '' ? association.as : `${parentPath}.${association.as}`;
      const through =
        association.through === undefined
          ? undefined
          : {
              model: association.through.model,
              definition: stateOf(association.through.model).definition,
              alias: `${alias}->${stateOf(association.through.model).definition.name}`,
              path: `${path}.${stateOf(association.through.model).definition.name}`,
              attributes: item.through?.attributes,
              where: item.through?.where,
            };
      return {
        association,
        model,
        definition: stateOf(model).definition,
        as: association.as,
        alias,
        path,
        where: item.where,
        required: item.required ?? item.where !== undefined,
        right: item.right === true,
        attributes: item.attributes,
        separate: item.separate === true && association.associationType === 'HasMany',
        paranoid: item.paranoid !== false,
        order: item.order,
        limit: item.limit,
        through,
        children: this.normalize(model, item.include, alias, path),
      };
    });
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
      paranoid: node.paranoid,
      ...(node.where === undefined ? {} : { where: node.where }),
      ...(node.attributes === undefined ? {} : { attributes: node.attributes }),
      ...(node.children.length === 0
        ? {}
        : { include: node.children.map((child) => this.toOptions(child)) }),
    };
  }

  #associationsOf(model: Model): ReadonlyMap<string, Association> {
    return stateOf(model).associations as ReadonlyMap<string, Association>;
  }

  #resolveAssociation(source: Model, item: IncludeOptions): Association {
    const associations = this.#associationsOf(source);
    const sourceName = stateOf(source).definition.name;
    if (item.association !== undefined) {
      const association =
        typeof item.association === 'string'
          ? associations.get(item.association)
          : item.association;
      if (association === undefined) {
        throw new Error(
          `Association with alias "${String(item.association)}" does not exist on ${sourceName}`,
        );
      }
      return association;
    }
    if (item.as !== undefined) {
      const association = associations.get(item.as);
      if (
        association === undefined ||
        (item.model !== undefined && !sameModel(association.target, item.model))
      ) {
        const targetName = item.model === undefined ? item.as : stateOf(item.model).definition.name;
        throw new Error(
          `${targetName} is associated to ${sourceName} using an alias. You've included an alias (${item.as}), but it does not match the alias(es) defined in your association.`,
        );
      }
      return association;
    }
    const candidates = [...associations.values()].filter(
      (association) => item.model !== undefined && sameModel(association.target, item.model),
    );
    const targetName = item.model === undefined ? '?' : stateOf(item.model).definition.name;
    if (candidates.length === 0) {
      throw new EagerLoadingError(`${targetName} is not associated to ${sourceName}!`);
    }
    if (candidates.length > 1) {
      throw new Error(
        `${targetName} is associated to ${sourceName} multiple times. To identify the correct association, you must use the 'as' keyword to specify the alias of the association you want to include.`,
      );
    }
    return candidates[0] as Association;
  }

  #expandAll(source: Model, items: readonly IncludeOptions[]): readonly IncludeOptions[] {
    return items.flatMap((item): readonly IncludeOptions[] =>
      item.all === true
        ? [...this.#associationsOf(source).values()].map((association): IncludeOptions => ({
            association,
          }))
        : [item],
    );
  }

  /**
   * Merges the scope of the included model into the include options like Sequelize v6
   * `_injectScope`: a scoped class given as `model` brings its scopes, otherwise the target's
   * default scope applies. Include options win.
   */
  #withTargetScope(item: IncludeOptions, target: Model): IncludeOptions {
    const scoped = item.model ?? target;
    return injectScope(
      activeScope(scoped),
      item as Readonly<Record<string, unknown>>,
      stateOf(scoped).scopes.whereMergeStrategy,
    ) as IncludeOptions;
  }
}
