import type { ModelDefinition } from './model-definition.ts';

type Getter = (this: unknown, key: string, options: unknown) => unknown;
type Setter = (this: unknown, value: unknown, key: string) => void;

/**
 * Custom getters and setters of a model: those of the attributes, else the `getterMethods` /
 * `setterMethods` options (Sequelize v6 `_customGetters` / `_customSetters`).
 *
 * @internal
 */
export class MethodLookup {
  getter(definition: ModelDefinition, name: string): Getter | undefined {
    const own = definition.attributes.get(name)?.get ?? this.#of(definition, 'getterMethods', name);
    return own as Getter | undefined;
  }

  setter(definition: ModelDefinition, name: string): Setter | undefined {
    const own = definition.attributes.get(name)?.set ?? this.#of(definition, 'setterMethods', name);
    return own as Setter | undefined;
  }

  // v6 `get()` lists every custom getter, also those without a stored value (VIRTUAL)
  // (the option getters only on instances that were not queried, like v6 `_options.attributes`)
  getterNames(definition: ModelDefinition, queried: boolean): readonly string[] {
    const attributes = [...definition.attributes]
      .filter(([, attribute]) => attribute.get !== undefined)
      .map(([name]) => name);
    const virtual = queried ? [] : Object.keys(definition.options.getterMethods ?? {});
    return [...virtual, ...attributes];
  }

  // names that need an `instance.<name>` accessor besides the attributes
  virtualNames(definition: ModelDefinition): readonly string[] {
    const { getterMethods, setterMethods } = definition.options;
    return Object.keys({ ...getterMethods, ...setterMethods });
  }

  #of(
    definition: ModelDefinition,
    option: 'getterMethods' | 'setterMethods',
    name: string,
  ): unknown {
    const methods = definition.options[option];
    return methods !== undefined && Object.hasOwn(methods, name) ? methods[name] : undefined;
  }
}
