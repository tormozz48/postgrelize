import type { AnyModel, SaveOptions, Values } from '../model/options.ts';
import { ModelValues } from '../model/model-values.ts';
import type { IncludeNode } from './include.ts';

/** Tells model instances apart from plain values (injected to avoid importing `Model`). */
export type InstanceCheck = (value: unknown) => value is AnyModel;

const modelValues = new ModelValues();

const toArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

/** Saves the nested instances of a nested creation, in the order Sequelize v6 does. */
export class NestedSaver {
  readonly #isInstance: InstanceCheck;

  /**
   * @param isInstance - Checks whether a value is a model instance.
   */
  constructor(isInstance: InstanceCheck) {
    this.#isInstance = isInstance;
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
        (previous, node) => previous.then(() => this.#saveParent(instance, node, options)),
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

  // like v6: the include entry's own options, the query options and the parent record reach the hooks
  #saveOptions(
    instance: AnyModel,
    node: IncludeNode,
    options: SaveOptions,
  ): ReturnType<ModelValues['queryOptions']> {
    return {
      ...node.custom,
      ...modelValues.queryOptions(options),
      parentRecord: instance,
    } as ReturnType<ModelValues['queryOptions']>;
  }

  async #saveParent(instance: AnyModel, node: IncludeNode, options: SaveOptions): Promise<void> {
    const [parent] = this.#nestedInstances(instance, node);
    if (parent !== undefined) {
      await parent.save(this.#saveOptions(instance, node, options));
      instance.set(node.association.foreignKey, parent.get(node.association.targetKey));
    }
  }

  async #saveChild(
    instance: AnyModel,
    node: IncludeNode,
    child: AnyModel,
    options: SaveOptions,
  ): Promise<void> {
    const { association } = node;
    const childOptions = this.#saveOptions(instance, node, options);
    if (association.associationType === 'BelongsToMany' && association.through !== undefined) {
      await child.save(childOptions);
      await this.#saveJunction(instance, node, child, childOptions);
      return;
    }
    child.set({
      ...association.scope,
      [association.foreignKey]: instance.get(association.sourceKey),
    });
    await child.save(childOptions);
  }

  async #saveJunction(
    instance: AnyModel,
    node: IncludeNode,
    child: AnyModel,
    childOptions: ReturnType<ModelValues['queryOptions']>,
  ): Promise<void> {
    const { association } = node;
    await association.through?.model.create(
      {
        ...this.#throughValues(child, node),
        ...association.through.scope,
        [association.foreignKey]: instance.get(association.sourceKey),
        [association.otherKey ?? '']: child.get(association.targetKey),
      } as never,
      childOptions as never,
    );
  }
}
