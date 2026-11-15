import { HookRegistry } from '../hooks/hooks.ts';
import type { StandardSchemaV1 } from '../validation/standard-schema.ts';
import type { ModelValidatorFunction } from '../validation/types.ts';
import {
  ModelDefinition,
  type DefinitionOptions,
  type ModelAttributes,
} from './model-definition.ts';
import type { InitOptions } from './options.ts';
import { runtimeKey, type ModelRuntime } from './runtime.ts';
import { ScopeRegistry } from './scope-registry.ts';

/** Internal state of an initialized model class. */
export type ModelState = Readonly<{
  definition: ModelDefinition;
  runtime: ModelRuntime;
  hooks: HookRegistry;
  scopes: ScopeRegistry;
  validators: Readonly<Record<string, ModelValidatorFunction>>;
  schema: StandardSchemaV1 | undefined;
  /** `init` input, kept to rebuild the definition when associations add attributes. */
  input: Readonly<{
    className: string;
    attributes: ModelAttributes;
    options: DefinitionOptions;
    extra: ModelAttributes;
  }>;
  /** Associations by alias. */
  associations: ReadonlyMap<string, unknown>;
}>;

/**
 * Builds the state of a model class from `Model.init` arguments, and rebuilds it when
 * associations add attributes.
 *
 * @internal
 */
export class ModelStateFactory {
  /**
   * State of a model class just initialized by `Model.init`.
   *
   * @param className - Class name (default model name).
   * @param attributes - Attribute definitions.
   * @param options - Model options, including the `sequelize` instance.
   * @returns The state.
   */
  create(className: string, attributes: ModelAttributes, options: InitOptions): ModelState {
    const {
      sequelize,
      hooks,
      defaultScope,
      scopes,
      whereMergeStrategy,
      validate,
      validationSchema,
      ...definitionOptions
    } = options;
    const runtime = sequelize[runtimeKey];
    return {
      ...this.#definitionState(className, attributes, definitionOptions, runtime),
      hooks: HookRegistry.fromOption(hooks, HookRegistry.fromOption(runtime.defaults.hooks)),
      scopes: new ScopeRegistry(defaultScope, scopes, whereMergeStrategy),
      validators: validate ?? {},
      schema: validationSchema,
    };
  }

  /**
   * State with the definition rebuilt from the `init` input plus attributes of associations.
   *
   * @param state - Current state.
   * @param attributes - Added attributes (foreign keys).
   * @returns The new state.
   */
  withAssociationAttributes(state: ModelState, attributes: ModelAttributes): ModelState {
    const extra = { ...state.input.extra, ...attributes };
    return {
      ...state,
      input: { ...state.input, extra },
      definition: ModelDefinition.normalize(
        state.input.className,
        state.input.attributes,
        state.input.options,
        state.runtime.defaults,
        extra,
      ),
    };
  }

  #definitionState(
    className: string,
    attributes: ModelAttributes,
    options: DefinitionOptions,
    runtime: ModelRuntime,
  ): Pick<ModelState, 'definition' | 'runtime' | 'input' | 'associations'> {
    return {
      definition: ModelDefinition.normalize(className, attributes, options, runtime.defaults),
      runtime,
      input: { className, attributes, options, extra: {} },
      associations: new Map(),
    };
  }
}
