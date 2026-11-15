import { HookRegistry, type HookFunction, type HookType } from '../hooks/hooks.ts';
import type { StandardSchemaV1 } from '../validation/standard-schema.ts';
import type { ModelValidatorFunction } from '../validation/types.ts';
import {
  ModelDefinition,
  type DefinitionOptions,
  type ModelAttributes,
} from './model-definition.ts';
import type { InitOptions } from './options.ts';
import { runtimeKey, type ModelRuntime, type RuntimeOwner } from './runtime.ts';
import {
  ScopeRegistry,
  type ScopeDefinition,
  type ScopeOptions,
  type ScopeSelector,
} from './scope-registry.ts';

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

type AttributeHost = Readonly<{
  get: (name: string) => unknown;
  set: (name: string, value: unknown) => unknown;
}>;

const NOT_INITIALIZED = 'Model is not initialized. Call Model.init() or sequelize.define() first.';

const states = new WeakMap<object, ModelState>();
const selections = new WeakMap<object, readonly ScopeSelector[]>();
const owners = new WeakMap<object, RuntimeOwner>();

/**
 * Per-class state of models: definition, runtime, hooks, scopes, validators and associations of
 * each initialized model class (shared by its scoped subclasses), the scopes selected by
 * `Model.scope()`, and the attribute / association accessors installed on model prototypes.
 * Instances share one store, so they can be created wherever needed.
 */
export class ModelRegistry {
  /**
   * Initializes a model class (`Model.init`): normalizes the definition, stores the state,
   * installs attribute accessors and registers the model in `sequelize.models`.
   *
   * @param model - Model class.
   * @param attributes - Attribute definitions.
   * @param options - Model options, including the `sequelize` instance.
   */
  init(
    model: Readonly<{ name: string; prototype: object }>,
    attributes: ModelAttributes,
    options: InitOptions,
  ): void {
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
    const definition = ModelDefinition.normalize(
      model.name,
      attributes,
      definitionOptions,
      runtime.defaults,
    );
    states.set(model, {
      definition,
      runtime,
      hooks: HookRegistry.fromOption(hooks, HookRegistry.fromOption(runtime.defaults.hooks)),
      scopes: new ScopeRegistry(defaultScope, scopes, whereMergeStrategy),
      validators: validate ?? {},
      schema: validationSchema,
      input: { className: model.name, attributes, options: definitionOptions, extra: {} },
      associations: new Map(),
    });
    owners.set(model, sequelize);
    this.defineAttributeAccessors(model.prototype, definition);
    runtime.register(definition.name, model);
  }

  /**
   * State of a model class or of a scoped subclass of it.
   *
   * @param model - Model class.
   * @returns The state.
   * @throws Error when the model is not initialized.
   */
  state(model: object): ModelState {
    const base = this.#owner(model);
    const state = base === undefined ? undefined : states.get(base);
    if (state === undefined) {
      throw new Error(NOT_INITIALIZED);
    }
    return state;
  }

  /**
   * Normalized definition of a model class.
   *
   * @param model - Model class.
   * @returns The definition.
   */
  definition(model: object): ModelDefinition {
    return this.state(model).definition;
  }

  /**
   * Replaces the state of the model that owns `model` (scoped subclasses share it).
   *
   * @param model - Model class.
   * @param change - Computes the new state from the current one.
   */
  update(model: object, change: (state: ModelState) => ModelState): void {
    const base = this.#owner(model);
    if (base === undefined) {
      throw new Error(NOT_INITIALIZED);
    }
    states.set(base, change(this.state(base)));
  }

  /**
   * `Sequelize` instance given to `Model.init` for exactly this class.
   *
   * @param model - Model class.
   * @returns The instance, or `undefined`.
   */
  sequelizeOf(model: object): RuntimeOwner | undefined {
    return owners.get(model);
  }

  /**
   * Adds a hook to a model.
   *
   * @param model - Model class.
   * @param type - Hook type.
   * @param nameOrFn - Hook name or function.
   * @param fn - Hook function when a name is given.
   */
  addHook(
    model: object,
    type: HookType,
    nameOrFn: string | HookFunction,
    fn: HookFunction | undefined,
  ): void {
    this.update(model, (state) => ({
      ...state,
      hooks:
        typeof nameOrFn === 'string'
          ? state.hooks.add(type, fn ?? this.#missingHook(), nameOrFn)
          : state.hooks.add(type, nameOrFn),
    }));
  }

  /**
   * Removes hooks of a model by name or function.
   *
   * @param model - Model class.
   * @param type - Hook type.
   * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
   */
  removeHook(model: object, type: HookType, nameOrFn: string | HookFunction | undefined): void {
    this.update(model, (state) => ({ ...state, hooks: state.hooks.remove(type, nameOrFn) }));
  }

  /**
   * Adds a named scope (or replaces the default scope with name `'defaultScope'`).
   *
   * @param model - Model class.
   * @param name - Scope name.
   * @param scope - Options or a function returning options.
   * @param override - Replace an existing scope.
   * @throws Error when the scope exists and `override` is not set.
   */
  addScope(model: object, name: string, scope: ScopeDefinition, override: boolean): void {
    if (this.state(model).scopes.has(name) && !override) {
      throw new Error(
        `The scope ${name} already exists. Pass { override: true } as options to silence this error`,
      );
    }
    this.update(model, (state) => ({ ...state, scopes: state.scopes.with(name, scope) }));
  }

  /**
   * Marks `scoped` (a subclass of `model`) as using the given scopes, checking that they resolve.
   *
   * @param model - Model class whose scopes are used.
   * @param scoped - Scoped subclass.
   * @param selectors - Selected scopes.
   */
  selectScopes(model: object, scoped: object, selectors: readonly ScopeSelector[]): void {
    this.state(model).scopes.resolve(selectors);
    selections.set(scoped, selectors);
  }

  /**
   * Scope options in effect for `model`: its selected scopes, or the default scope.
   *
   * @param model - Model class.
   * @returns Scope options.
   */
  activeScope(model: object): ScopeOptions {
    const state = this.state(model);
    const selected = selections.get(model);
    return selected === undefined ? state.scopes.defaultScope : state.scopes.resolve(selected);
  }

  /**
   * Query options with the active scope of `model` applied (query options win).
   *
   * @param model - Model class.
   * @param options - Query options.
   * @returns Merged options.
   */
  scoped<T extends ScopeOptions>(model: object, options: T): T {
    const { scopes } = this.state(model);
    const selected = selections.get(model);
    return scopes.inject(selected === undefined ? scopes.defaultScope : scopes.resolve(selected), {
      ...options,
    });
  }

  /**
   * Defines `instance.<attribute>` getters / setters on the model prototype (once per attribute).
   *
   * @param prototype - Model prototype.
   * @param definition - Model definition.
   */
  defineAttributeAccessors(prototype: object, definition: ModelDefinition): void {
    [...definition.attributes.keys()]
      .filter((name) => !Object.prototype.hasOwnProperty.call(prototype, name))
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

  /**
   * Defines `instance.<alias>` for an association, holding included / nested instances (Sequelize v6).
   *
   * @param prototype - Model prototype.
   * @param alias - Association alias.
   */
  defineAssociationAccessor(prototype: object, alias: string): void {
    if (Object.prototype.hasOwnProperty.call(prototype, alias)) {
      return;
    }
    Object.defineProperty(prototype, alias, {
      configurable: true,
      enumerable: false,
      get(this: Readonly<{ dataValues: Record<string, unknown> }>) {
        return this.dataValues[alias];
      },
      set(this: Readonly<{ dataValues: Record<string, unknown> }>, value: unknown) {
        this.dataValues[alias] = value;
      },
    });
  }

  /**
   * Rebuilds the definition of `model` with attributes contributed by associations.
   *
   * @param model - Model class.
   * @param attributes - Added attributes (foreign keys).
   * @returns The new definition.
   */
  addAssociationAttributes(model: object, attributes: ModelAttributes): ModelDefinition {
    this.update(model, (state) => {
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
    });
    const { definition } = this.state(model);
    this.defineAttributeAccessors((model as { prototype: object }).prototype, definition);
    return definition;
  }

  #owner(model: object | null): object | undefined {
    return model === null
      ? undefined
      : states.has(model)
        ? model
        : this.#owner(Object.getPrototypeOf(model) as object | null);
  }

  #missingHook(): never {
    throw new Error('addHook: hook function is required');
  }
}
