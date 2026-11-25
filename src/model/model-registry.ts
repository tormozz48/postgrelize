import { HookRegistry, type HookFunction, type HookType } from '../hooks/hooks.ts';
import { DefineHooks } from './define-hooks.ts';
import type { ModelAttributes, ModelDefinition } from './model-definition.ts';
import { ModelAccessors } from './model-accessors.ts';
import { ModelStateFactory, type ModelState } from './model-state.ts';
import type { InitOptions } from './options.ts';
import type { RuntimeOwner } from './runtime.ts';
import type { ScopeDefinition, ScopeOptions, ScopeSelector } from './scope-registry.ts';

export type { ModelState } from './model-state.ts';

const NOT_INITIALIZED = 'Model is not initialized. Call Model.init() or sequelize.define() first.';

const states = new WeakMap<object, ModelState>();
const selections = new WeakMap<object, readonly ScopeSelector[]>();
const owners = new WeakMap<object, RuntimeOwner>();
const accessors = new ModelAccessors();
const factory = new ModelStateFactory();
const defineHooks = new DefineHooks();

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
    const defined = defineHooks.before(model, attributes, options);
    if (defined.name !== model.name) {
      Object.defineProperty(model, 'name', { value: defined.name, configurable: true });
    }
    const state = factory.create(defined.name, defined.attributes, defined.options);
    states.set(model, state);
    owners.set(model, options.sequelize);
    this.defineAttributeAccessors(model.prototype, state.definition);
    state.runtime.register(state.definition.name, model);
    HookRegistry.runAllSync([state.runtime.hooks()], 'afterDefine', options.sequelize, model);
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
    return state.definition.name === (base as { name: string }).name
      ? state
      : this.#renamed(base as object, state);
  }

  // v6 reads `Model.name` whenever it builds a query (table alias, include aliases), so a class that
  // was renamed after `init` (a bundler, a test redefining `name`) keeps the SQL and `Model.name`
  // in step: raw fragments built from `Model.name` refer to the alias the query emits.
  #renamed(base: object, state: ModelState): ModelState {
    const name = (base as { name: string }).name;
    const renamed = { ...state, definition: { ...state.definition, name } };
    states.set(base, renamed);
    return renamed;
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
   * Gives `bound` (a subclass of `model`) its own state bound to a schema, and the scope
   * selection of `model`.
   *
   * @param model - Model class the copy extends.
   * @param bound - Schema-bound subclass.
   * @param schema - Schema name.
   * @param delimiter - Separator reported by `getTableName`.
   */
  bindSchema(model: object, bound: object, schema: string, delimiter: string | undefined): void {
    states.set(bound, factory.withSchema(this.state(model), schema, delimiter));
    const owner = owners.get(this.#owner(model) as object);
    if (owner !== undefined) {
      owners.set(bound, owner);
    }
    const selected = selections.get(model);
    if (selected !== undefined) {
      selections.set(bound, selected);
    }
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
    return scopes.inject(
      selected === undefined ? scopes.defaultScope : scopes.resolve(selected),
      options,
    );
  }

  /**
   * Defines `instance.<attribute>` getters / setters on the model prototype (once per attribute).
   *
   * @param prototype - Model prototype.
   * @param definition - Model definition.
   */
  defineAttributeAccessors(prototype: object, definition: ModelDefinition): void {
    accessors.defineAttributes(prototype, definition);
  }

  /**
   * Defines `instance.<alias>` for an association, holding included / nested instances (Sequelize v6).
   *
   * @param prototype - Model prototype.
   * @param alias - Association alias.
   */
  defineAssociationAccessor(prototype: object, alias: string): void {
    accessors.defineAssociation(prototype, alias);
  }

  /**
   * Rebuilds the definition of `model` with attributes contributed by associations.
   *
   * @param model - Model class.
   * @param attributes - Added attributes (foreign keys).
   * @returns The new definition.
   */
  addAssociationAttributes(model: object, attributes: ModelAttributes): ModelDefinition {
    this.update(model, (state) => factory.withAssociationAttributes(state, attributes));
    const { definition } = this.state(model);
    this.defineAttributeAccessors((model as { prototype: object }).prototype, definition);
    return definition;
  }

  /**
   * Removes an attribute and rebuilds the definition (`Model.removeAttribute`).
   *
   * @param model - Model class.
   * @param attribute - Attribute name.
   */
  removeAttribute(model: object, attribute: string): void {
    this.update(model, (state) => factory.withoutAttribute(state, attribute));
  }

  /**
   * Rebuilds the definition from the `init` input (`Model.refreshAttributes`).
   *
   * @param model - Model class.
   */
  refreshAttributes(model: object): void {
    this.addAssociationAttributes(model, {});
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
