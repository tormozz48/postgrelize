import { InstanceState } from '../instance-state.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { AnyModel } from '../options.ts';

type Selection =
  | readonly unknown[]
  | Readonly<{ include?: readonly unknown[]; exclude?: readonly string[] }>;

/**
 * Marks which virtual attributes with a getter the `attributes` option of a finder left out, so
 * `get()` of the found instances omits them, like Sequelize v6.
 *
 * @internal
 */
export class VirtualSelection {
  /**
   * @param definition - Model definition.
   * @param attributes - `attributes` option of the finder.
   * @param found - Instances of the finder.
   */
  apply(definition: ModelDefinition, attributes: unknown, found: readonly unknown[]): void {
    if (typeof attributes !== 'object' || attributes === null) {
      return;
    }
    const selection = attributes as Selection;
    const left = [...definition.attributes]
      .filter(([, attribute]) => attribute.get !== undefined && attribute.type.isVirtual === true)
      .map(([name]) => name)
      .filter((name) => !this.#selected(selection, name));
    if (left.length === 0) {
      return;
    }
    const unselected = new Set(left);
    found.forEach((instance) => {
      InstanceState.of(instance as AnyModel).unselected = unselected;
    });
  }

  #selected(selection: Selection, name: string): boolean {
    if (Array.isArray(selection)) {
      return selection.includes(name);
    }
    const { include, exclude } = selection as Exclude<Selection, readonly unknown[]>;
    return exclude?.includes(name) !== true || include?.includes(name) === true;
  }
}
