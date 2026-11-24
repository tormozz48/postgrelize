import { HookRegistry } from '../hooks/hooks.ts';
import { inflector } from './inflector.ts';
import type { ModelAttributes } from './model-definition.ts';
import type { InitOptions } from './options.ts';
import { runtimeKey } from './runtime.ts';

/** Attributes and options of a model after the `beforeDefine` hooks ran. */
export type DefinedModel = Readonly<{
  name: string;
  attributes: ModelAttributes;
  options: InitOptions;
}>;

/**
 * `beforeDefine(attributes, options)` hooks of the Sequelize instance: they may change the model name, its
 * `name` forms (`options.name.plural`), the attributes and the options before the definition is normalized (v6).
 *
 * @internal
 */
export class DefineHooks {
  /**
   * Runs the hooks on copies of the input.
   *
   * @param model - Model class being initialized.
   * @param attributes - Attribute definitions.
   * @param options - Model options, including the `sequelize` instance.
   * @returns The (possibly changed) name, attributes and options.
   */
  before(
    model: Readonly<{ name: string }>,
    attributes: ModelAttributes,
    options: InitOptions,
  ): DefinedModel {
    const hooks = options.sequelize[runtimeKey].hooks();
    if (!hooks.has('beforeDefine')) {
      return { name: options.modelName ?? model.name, attributes, options };
    }
    const name = options.modelName ?? model.name;
    const copy = { attributes: { ...attributes }, options: this.#withNames(options, name) };
    HookRegistry.runAllSync(
      [hooks],
      'beforeDefine',
      options.sequelize,
      copy.attributes,
      copy.options,
    );
    return { name: copy.options.modelName ?? name, ...copy };
  }

  #withNames(options: InitOptions, name: string): InitOptions {
    const forms = { plural: inflector.pluralize(name), singular: inflector.singularize(name) };
    return { name: forms, ...options, modelName: name };
  }
}
