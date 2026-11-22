import { EagerLoadingError } from '../errors/errors.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { IncludeOptions } from './include.ts';
import type { Association } from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;

/** Finds the association an include entry refers to, by object, alias or target model. */
export class AssociationLookup {
  /**
   * Replaces `{ all: true }` entries with one entry per association of `source`.
   *
   * @param source - Model the includes are resolved on.
   * @param items - Include entries.
   * @returns Include entries without `all`.
   */
  expandAll(source: Model, items: readonly IncludeOptions[]): readonly IncludeOptions[] {
    return items.flatMap((item): readonly IncludeOptions[] =>
      item.all === true
        ? [...this.#associationsOf(source).values()].map((association): IncludeOptions => ({
            association,
          }))
        : [item],
    );
  }

  /**
   * Association an include entry refers to.
   *
   * @param source - Model the include is resolved on.
   * @param item - Include entry.
   * @returns The association.
   * @throws EagerLoadingError when the target model is not associated to `source`.
   */
  resolve(source: Model, item: IncludeOptions): Association {
    if (item.association !== undefined) {
      return this.#byAssociation(source, item.association);
    }
    return item.as === undefined
      ? this.#byModel(source, item)
      : this.#byAlias(source, item.as, item);
  }

  #associationsOf(model: Model): ReadonlyMap<string, Association> {
    return registry.state(model).associations as ReadonlyMap<string, Association>;
  }

  #nameOf(model: Model): string {
    return registry.state(model).definition.name;
  }

  #sameModel(left: Model, right: Model): boolean {
    return registry.state(left) === registry.state(right);
  }

  #byAssociation(source: Model, given: Association | string): Association {
    const association = typeof given === 'string' ? this.#associationsOf(source).get(given) : given;
    if (association === undefined) {
      throw new Error(
        `Association with alias "${String(given)}" does not exist on ${this.#nameOf(source)}`,
      );
    }
    return association;
  }

  #aliases(source: Model, item: IncludeOptions): readonly string[] {
    const { model } = item;
    return [...this.#associationsOf(source).values()]
      .filter((association) => model === undefined || this.#sameModel(association.target, model))
      .map((association) => association.as);
  }

  #byAlias(source: Model, alias: string, item: IncludeOptions): Association {
    const association = this.#associationsOf(source).get(alias);
    if (
      association === undefined ||
      (item.model !== undefined && !this.#sameModel(association.target, item.model))
    ) {
      const targetName = item.model === undefined ? alias : this.#nameOf(item.model);
      throw new EagerLoadingError(
        `${targetName} is associated to ${this.#nameOf(source)} using an alias. You've included an alias (${alias}), but it does not match the alias(es) defined in your association (${this.#aliases(source, item).join(', ')}).`,
      );
    }
    return association;
  }

  #byModel(source: Model, item: IncludeOptions): Association {
    const candidates = [...this.#associationsOf(source).values()].filter(
      (association) => item.model !== undefined && this.#sameModel(association.target, item.model),
    );
    const targetName = item.model === undefined ? '?' : this.#nameOf(item.model);
    if (candidates.length === 0) {
      throw new EagerLoadingError(`${targetName} is not associated to ${this.#nameOf(source)}!`);
    }
    // Like v6: among several associations to the same model, the one without an explicit alias wins.
    const unaliased = candidates.find((association) => !association.isAliased);
    if (candidates.length > 1 && unaliased === undefined) {
      throw new EagerLoadingError(
        `${targetName} is associated to ${this.#nameOf(source)} multiple times. To identify the correct association, you must use the 'as' keyword to specify the alias of the association you want to include.`,
      );
    }
    return (unaliased ?? candidates[0]) as Association;
  }
}
