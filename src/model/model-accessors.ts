import { MethodLookup } from './method-lookup.ts';
import type { ModelDefinition } from './model-definition.ts';

type AttributeHost = Readonly<{
  get: (name: string) => unknown;
  set: (name: string, value: unknown) => unknown;
}>;

const methods = new MethodLookup();

type AssociationHost = Readonly<{ dataValues: Record<string, unknown> }>;

/**
 * Installs `instance.<attribute>` and `instance.<alias>` accessors on model prototypes.
 *
 * @internal
 */
export class ModelAccessors {
  /**
   * Defines `instance.<attribute>` getters / setters on the model prototype (once per attribute).
   *
   * @param prototype - Model prototype.
   * @param definition - Model definition.
   */
  defineAttributes(prototype: object, definition: ModelDefinition): void {
    [...new Set([...definition.attributes.keys(), ...methods.virtualNames(definition)])]
      .filter((name) => !Object.prototype.hasOwnProperty.call(prototype, name))
      // like v6, an attribute does not replace a built-in instance method (`set`, `get`, ...)
      .filter((name) => !this.#isBuiltIn(prototype, name))
      .forEach((name) =>
        Object.defineProperty(prototype, name, {
          configurable: true,
          enumerable: false,
          get(this: AttributeHost) {
            return this.get(name);
          },
          set(this: AttributeHost, value: unknown) {
            this.set(name, value);
          },
        }),
      );
  }

  // members of the base `Model` prototype, found below the model's own prototypes; the extensions
  // postgrelize adds there give way to attributes of the same name
  #isBuiltIn(prototype: object | null, name: string): boolean {
    if (prototype === null || name === 'wasInserted' || name === 'oldValues') {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(prototype, 'getDataValue')
      ? name in prototype
      : this.#isBuiltIn(Object.getPrototypeOf(prototype) as object | null, name);
  }

  /**
   * Defines `instance.<alias>` for an association, holding included / nested instances.
   *
   * @param prototype - Model prototype.
   * @param alias - Association alias.
   */
  defineAssociation(prototype: object, alias: string): void {
    if (Object.prototype.hasOwnProperty.call(prototype, alias)) {
      return;
    }
    Object.defineProperty(prototype, alias, {
      configurable: true,
      enumerable: false,
      get(this: AssociationHost) {
        return this.dataValues[alias];
      },
      // Like v6, a value assigned by the caller is a plain property of the instance and not part of its
      // values, so `get({ plain: true })` / `toJSON()` do not follow it (a cycle would never end).
      set(this: AssociationHost, value: unknown) {
        Object.defineProperty(this, alias, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
  }
}
