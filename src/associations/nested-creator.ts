import type { AnyModel, SaveOptions, Values } from '../model/options.ts';
import { ModelValues } from '../model/model-values.ts';
import type { IncludeNode } from './include.ts';
import type { IncludeResolver } from './include-resolver.ts';

/** Tells model instances apart from plain values (injected to avoid importing `Model`). */
export type InstanceCheck = (value: unknown) => value is AnyModel;

const modelValues = new ModelValues();

const toArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

/**
 * Nested creation (`Model.create(values, { include })`, Sequelize v6): builds nested instances
 * from the values, saves belongsTo parents before the instance and hasOne / hasMany /
 * belongsToMany children (with their junction rows) after it.
 */
export class NestedCreator {
  readonly #resolver: IncludeResolver;
  readonly #isInstance: InstanceCheck;

  /**
   * @param resolver - Converts include nodes back to options for the nested builds.
   * @param isInstance - Checks whether a value is a model instance.
   */
  constructor(resolver: IncludeResolver, isInstance: InstanceCheck) {
    this.#resolver = resolver;
    this.#isInstance = isInstance;
  }

  /**
   * Builds the nested instance(s) of an include from the given values; instances are kept.
   *
   * @param node - Include node.
   * @param value - Values (a list for multi associations), an instance, or `null`.
   * @returns Nested instance(s), or `null`.
   */
  build(node: IncludeNode, value: unknown): unknown {
    const build = (item: unknown): unknown => {
      if (this.#isInstance(item)) {
        return item;
      }
      const child = new node.model(
        item as Values,
        node.children.length === 0
          ? {}
          : { include: node.children.map((nested) => this.#resolver.toOptions(nested)) },
      );
      const through = node.association.through?.model;
      const throughName = node.through?.definition.name;
      if (
        through !== undefined &&
        throughName !== undefined &&
        typeof item === 'object' &&
        item !== null &&
        throughName in item
      ) {
        const throughValue = (item as Values)[throughName];
        (child.dataValues as Values)[throughName] = this.#isInstance(throughValue)
          ? throughValue
          : new through(throughValue as Values);
      }
      return child;
    };
    return value === null
      ? null
      : node.association.isMultiAssociation
        ? toArray(value).map(build)
        : build(value);
  }

  /**
   * Saves nested belongsTo parents and sets the foreign keys on the instance.
   *
   * @param instance - Instance being created.
   * @param includes - Include tree of the instance.
   * @param options - Save options (query options are passed on).
   * @returns Resolves when the parents are saved.
   */
  async saveBelongsTo(
    instance: AnyModel,
    includes: readonly IncludeNode[],
    options: SaveOptions,
  ): Promise<void> {
    await includes
      .filter((node) => node.association.associationType === 'BelongsTo')
      .reduce<Promise<unknown>>(
        (previous, node) =>
          previous.then(async () => {
            const [parent] = this.#nestedInstances(instance, node);
            if (parent !== undefined) {
              await parent.save(modelValues.queryOptions(options));
              instance.set(node.association.foreignKey, parent.get(node.association.targetKey));
            }
          }),
        Promise.resolve(),
      );
  }

  /**
   * Saves nested hasOne / hasMany / belongsToMany children after the instance, one at a time.
   *
   * @param instance - Saved instance.
   * @param includes - Include tree of the instance.
   * @param options - Save options (query options are passed on).
   * @returns Resolves when the children are saved.
   */
  async saveChildren(
    instance: AnyModel,
    includes: readonly IncludeNode[],
    options: SaveOptions,
  ): Promise<void> {
    const pairs = includes
      .filter((node) => node.association.associationType !== 'BelongsTo')
      .flatMap((node) =>
        this.#nestedInstances(instance, node).map((child) => [node, child] as const),
      );
    await pairs.reduce<Promise<unknown>>(
      (previous, [node, child]) =>
        previous.then(() => this.#saveChild(instance, node, child, options)),
      Promise.resolve(),
    );
  }

  #nestedInstances(instance: AnyModel, node: IncludeNode): readonly AnyModel[] {
    return toArray((instance.dataValues as Values)[node.as]).filter(this.#isInstance);
  }

  #throughValues(child: AnyModel, node: IncludeNode): Values {
    const value =
      node.through === undefined
        ? undefined
        : (child.dataValues as Values)[node.through.definition.name];
    return this.#isInstance(value)
      ? (value.get({ plain: true }) as Values)
      : typeof value === 'object' && value !== null
        ? (value as Values)
        : {};
  }

  async #saveChild(
    instance: AnyModel,
    node: IncludeNode,
    child: AnyModel,
    options: SaveOptions,
  ): Promise<void> {
    const { association } = node;
    const childOptions = modelValues.queryOptions(options);
    if (association.associationType === 'BelongsToMany' && association.through !== undefined) {
      await child.save(childOptions);
      await association.through.model.create(
        {
          ...this.#throughValues(child, node),
          ...association.through.scope,
          [association.foreignKey]: instance.get(association.sourceKey),
          [association.otherKey ?? '']: child.get(association.targetKey),
        } as never,
        childOptions as never,
      );
      return;
    }
    child.set({
      ...association.scope,
      [association.foreignKey]: instance.get(association.sourceKey),
    });
    await child.save(childOptions);
  }
}
