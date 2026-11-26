import { EagerLoadingError } from '../errors/errors.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { IncludeOptions } from './include.ts';
import type { Association } from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;
type AllSpec = Readonly<{
  rest: Readonly<Record<string, unknown>>;
  types: ReadonlySet<string> | undefined;
  nested: boolean;
  used: Model[];
}>;

const ALL_TYPES: Readonly<Record<string, readonly string[]>> = {
  BelongsTo: ['BelongsTo'],
  HasOne: ['HasOne'],
  HasMany: ['HasMany'],
  One: ['BelongsTo', 'HasOne'],
  Has: ['HasOne', 'HasMany'],
  Many: ['HasMany'],
};

type AliasForms = Readonly<{ plural?: string; singular?: string }>;

/** Finds the association an include entry refers to, by object, alias or target model. */
export class AssociationLookup {
  /**
   * Replaces `{ all: ... }` entries with one entry per association of `source` (v6
   * `_expandIncludeAllElement`): `all` is `true` or the association types to include, `nested`
   * recurses, and the other options of the entry are copied to every generated include. An
   * association the include list already names is skipped.
   *
   * @param source - Model the includes are resolved on.
   * @param items - Include entries.
   * @returns Include entries without `all`.
   * @throws EagerLoadingError for an unknown association type in `all`.
   */
  expandAll(source: Model, items: readonly IncludeOptions[]): readonly IncludeOptions[] {
    const named = items.filter((item) => !item.all);
    const generated = items
      .filter((item) => item.all)
      .flatMap((item) => this.#generate(source, item, named));
    return [...named, ...generated];
  }

  #generate(
    source: Model,
    item: IncludeOptions,
    named: readonly IncludeOptions[],
  ): readonly IncludeOptions[] {
    const { all, nested, ...rest } = item as IncludeOptions & { nested?: boolean };
    const types = this.#types(all);
    const out: IncludeOptions[] = [];
    this.#add(source, { rest, types, nested: nested === true, used: [] }, [...named], out);
    return out;
  }

  #add(model: Model, spec: AllSpec, existing: IncludeOptions[], out: IncludeOptions[]): void {
    for (const association of this.#associationsOf(model).values()) {
      if (!this.#skip(association, spec, existing)) {
        spec.used.push(model);
        out.push(this.#entry(association, spec));
      }
    }
    spec.used.pop();
  }

  #entry(association: Association, spec: AllSpec): IncludeOptions {
    const created: IncludeOptions = {
      ...spec.rest,
      model: association.target,
      ...(association.isAliased ? { as: association.as } : {}),
    };
    const children: IncludeOptions[] = [];
    if (spec.nested) {
      this.#add(association.target, spec, [], children);
    }
    return children.length === 0 ? created : { ...created, include: children };
  }

  #skip(association: Association, spec: AllSpec, existing: readonly IncludeOptions[]): boolean {
    return (
      (spec.types !== undefined && !spec.types.has(association.associationType)) ||
      existing.some((entry) => this.#names(entry, association)) ||
      (spec.nested && spec.used.includes(association.target))
    );
  }

  #names(entry: IncludeOptions, association: Association): boolean {
    const model =
      entry.model ?? (typeof entry.association === 'object' ? entry.association.target : undefined);
    const as = association.isAliased ? association.as : undefined;
    return model === association.target && (as === undefined || entry.as === as);
  }

  #types(all: unknown): ReadonlySet<string> | undefined {
    const requested = all === true ? ['All'] : Array.isArray(all) ? all : [all];
    const types = requested.flatMap((type: unknown): readonly string[] => {
      if (type === 'All') {
        return ['All'];
      }
      const expanded = ALL_TYPES[String(type)];
      if (expanded === undefined) {
        throw new EagerLoadingError(
          `include all '${String(type)}' is not valid - must be BelongsTo, HasOne, HasMany, One, Has, Many or All`,
        );
      }
      return expanded;
    });
    return types.includes('All') ? undefined : new Set(types);
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
    const alias: unknown = item.as;
    if (alias !== null && typeof alias === 'object') {
      return this.#byAliasObject(source, alias as AliasForms, item);
    }
    return item.as === undefined
      ? this.#byModel(source, item)
      : this.#byAlias(source, item.as, item);
  }

  // v6 `verifyAssociationAlias`: the plural (to-many) or singular (to-one) form names the association;
  // without it only an unaliased association matches
  #byAliasObject(source: Model, alias: AliasForms, item: IncludeOptions): Association {
    const found = [...this.#associationsOf(source).values()].find(
      (association) =>
        (item.model === undefined || this.#sameModel(association.target, item.model)) &&
        this.#verifies(association, alias),
    );
    if (found === undefined) {
      throw new EagerLoadingError(
        `${item.model === undefined ? '?' : this.#nameOf(item.model)} is associated to ${this.#nameOf(source)} using an alias. You've included an alias, but it does not match the alias(es) defined in your association (${this.#aliases(source, item).join(', ')}).`,
      );
    }
    return found;
  }

  #verifies(association: Association, alias: AliasForms): boolean {
    const form = association.isMultiAssociation ? alias.plural : alias.singular;
    return form === undefined ? !association.isAliased : association.as === form;
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
