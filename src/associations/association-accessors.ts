import type { AnyModel } from '../model/options.ts';
import type { AssociationName, AssociationType } from './types.ts';

type Instance = AnyModel;
type AccessorImplementation = (instance: Instance, ...args: never[]) => unknown;

/** Accessor key (see {@link Association.accessors}) → association method implementing it. */
const ACCESSOR_METHODS: Readonly<Record<string, string>> = {
  get: 'get',
  set: 'set',
  create: 'create',
  add: 'add',
  addMultiple: 'add',
  remove: 'remove',
  removeMultiple: 'remove',
  hasSingle: 'has',
  hasAll: 'has',
  count: 'count',
};

/** Names of the accessor methods of an association and their installation on a prototype. */
export class AssociationAccessors {
  /**
   * Accessor method names of an association.
   *
   * @param type - Kind of association.
   * @param name - Singular and plural alias forms.
   * @returns Accessor key → method name.
   */
  namesFor(type: AssociationType, name: AssociationName): Readonly<Record<string, string>> {
    const singular = this.#upperFirst(name.singular);
    const plural = this.#upperFirst(name.plural);
    return type === 'BelongsTo' || type === 'HasOne'
      ? this.#single(singular)
      : this.#multi(singular, plural);
  }

  /**
   * Installs the accessor methods on a model prototype, leaving existing methods untouched.
   *
   * @param association - Association whose methods implement the accessors.
   * @param prototype - Source model prototype.
   * @param accessors - Accessor key → method name.
   */
  install(
    association: object,
    prototype: object,
    accessors: Readonly<Record<string, string>>,
  ): void {
    const methods = association as Readonly<Record<string, unknown>>;
    Object.entries(accessors).forEach(([key, methodName]) => {
      const implementation = methods[ACCESSOR_METHODS[key] ?? ''];
      if (
        typeof implementation === 'function' &&
        !Object.prototype.hasOwnProperty.call(prototype, methodName)
      ) {
        Object.defineProperty(prototype, methodName, {
          configurable: true,
          writable: true,
          value: this.#instanceMethod(association, implementation as AccessorImplementation),
        });
      }
    });
  }

  #upperFirst(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  #single(singular: string): Readonly<Record<string, string>> {
    return { get: `get${singular}`, set: `set${singular}`, create: `create${singular}` };
  }

  #multi(singular: string, plural: string): Readonly<Record<string, string>> {
    return {
      get: `get${plural}`,
      set: `set${plural}`,
      addMultiple: `add${plural}`,
      add: `add${singular}`,
      create: `create${singular}`,
      remove: `remove${singular}`,
      removeMultiple: `remove${plural}`,
      hasSingle: `has${singular}`,
      hasAll: `has${plural}`,
      count: `count${plural}`,
    };
  }

  #instanceMethod(
    association: object,
    implementation: AccessorImplementation,
  ): (this: Instance, ...args: never[]) => unknown {
    return function accessor(this: Instance, ...args: never[]): unknown {
      return implementation.call(association, this, ...args);
    };
  }
}
