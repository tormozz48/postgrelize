import type { AnyModel, SaveOptions, Values } from '../model/options.ts';
import type { IncludeNode } from './include.ts';
import type { IncludeResolver } from './include-resolver.ts';
import { NestedSaver, type InstanceCheck } from './nested-saver.ts';

export type { InstanceCheck } from './nested-saver.ts';

const toArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

/**
 * Nested creation (`Model.create(values, { include })`, Sequelize v6): builds nested instances
 * from the values, saves belongsTo parents before the instance and hasOne / hasMany /
 * belongsToMany children (with their junction rows) after it.
 */
export class NestedCreator {
  readonly #resolver: IncludeResolver;
  readonly #isInstance: InstanceCheck;
  readonly #saver: NestedSaver;

  /**
   * @param resolver - Converts include nodes back to options for the nested builds.
   * @param isInstance - Checks whether a value is a model instance.
   */
  constructor(resolver: IncludeResolver, isInstance: InstanceCheck) {
    this.#resolver = resolver;
    this.#isInstance = isInstance;
    this.#saver = new NestedSaver(isInstance);
  }

  /**
   * Builds the nested instance(s) of an include from the given values; instances are kept.
   *
   * @param node - Include node.
   * @param value - Values (a list for multi associations), an instance, or `null`.
   * @returns Nested instance(s), or `null`.
   */
  build(node: IncludeNode, value: unknown): unknown {
    const build = (item: unknown): unknown => this.#buildOne(node, item);
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
  saveBelongsTo(
    instance: AnyModel,
    includes: readonly IncludeNode[],
    options: SaveOptions,
  ): Promise<void> {
    return this.#saver.saveBelongsTo(instance, includes, options);
  }

  /**
   * Saves nested hasOne / hasMany / belongsToMany children after the instance, one at a time.
   *
   * @param instance - Saved instance.
   * @param includes - Include tree of the instance.
   * @param options - Save options (query options are passed on).
   * @returns Resolves when the children are saved.
   */
  saveChildren(
    instance: AnyModel,
    includes: readonly IncludeNode[],
    options: SaveOptions,
  ): Promise<void> {
    return this.#saver.saveChildren(instance, includes, options);
  }

  #buildOne(node: IncludeNode, item: unknown): unknown {
    if (this.#isInstance(item)) {
      return item;
    }
    const child = new node.model(
      item as Values,
      node.children.length === 0
        ? {}
        : { include: node.children.map((nested) => this.#resolver.toOptions(nested)) },
    );
    this.#attachThrough(child, node, item);
    return child;
  }

  #attachThrough(child: AnyModel, node: IncludeNode, item: unknown): void {
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
  }
}
