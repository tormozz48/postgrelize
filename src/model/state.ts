import { emptyHooks, type HookRegistry } from '../hooks/hooks.ts';
import type { StandardSchemaV1 } from '../validation/standard-schema.ts';
import type { ModelValidatorFunction } from '../validation/types.ts';
import {
  normalizeDefinition,
  type DefinitionOptions,
  type ModelAttributes,
  type ModelDefinition,
} from './definition.ts';
import type { ModelRuntime } from './runtime.ts';
import {
  resolveScopes,
  scopeRegistry,
  type ScopeOptions,
  type ScopeRegistry,
  type ScopeSelector,
} from './scopes.ts';

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

/** @internal */
export const states = new WeakMap<object, ModelState>();

const selections = new WeakMap<object, readonly ScopeSelector[]>();

const owner = (model: object | null): object | undefined =>
  model === null
    ? undefined
    : states.has(model)
      ? model
      : owner(Object.getPrototypeOf(model) as object | null);

/** State of a model class or of a scoped subclass of it. */
export const stateOf = (model: object): ModelState => {
  const base = owner(model);
  const state = base === undefined ? undefined : states.get(base);
  if (state === undefined) {
    throw new Error('Model is not initialized. Call Model.init() or sequelize.define() first.');
  }
  return state;
};

/** Replaces the state of the model that owns `model` (scoped subclasses share it). */
export const updateState = (model: object, change: (state: ModelState) => ModelState): void => {
  const base = owner(model);
  if (base === undefined) {
    throw new Error('Model is not initialized. Call Model.init() or sequelize.define() first.');
  }
  states.set(base, change(stateOf(base)));
};

/** Initial state for `Model.init`. */
export const initialState = (
  definition: ModelDefinition,
  runtime: ModelRuntime,
  input: ModelState['input'],
  options: Readonly<{
    hooks: HookRegistry | undefined;
    defaultScope: ScopeOptions | undefined;
    scopes:
      | Readonly<Record<string, ScopeOptions | ((...args: never[]) => ScopeOptions)>>
      | undefined;
    whereMergeStrategy: 'overwrite' | 'and' | undefined;
    validate: Readonly<Record<string, ModelValidatorFunction>> | undefined;
    schema: StandardSchemaV1 | undefined;
  }>,
): ModelState => ({
  definition,
  runtime,
  hooks: options.hooks ?? emptyHooks,
  scopes: scopeRegistry(options.defaultScope, options.scopes, options.whereMergeStrategy),
  validators: options.validate ?? {},
  schema: options.schema,
  input,
  associations: new Map(),
});

/** Marks `model` (a scoped subclass) as using the given scopes. */
export const selectScopes = (model: object, selectors: readonly ScopeSelector[]): void => {
  selections.set(model, selectors);
};

/** Scope options in effect for `model`: its selected scopes, or the default scope. */
export const activeScope = (model: object): ScopeOptions => {
  const state = stateOf(model);
  const selected = selections.get(model);
  return selected === undefined ? state.scopes.defaultScope : resolveScopes(state.scopes, selected);
};

type AttributeHost = Readonly<{
  get: (name: string) => unknown;
  set: (name: string, value: unknown) => unknown;
}>;

/** Defines `instance.<attribute>` getters/setters on the model prototype (once per attribute). */
export const defineAttributeAccessors = (prototype: object, definition: ModelDefinition): void => {
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
};

/** Defines `instance.<alias>` for an association, holding included / nested instances (Sequelize v6). */
export const defineAssociationAccessor = (prototype: object, alias: string): void => {
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
};

/** Rebuilds the definition of `model` with attributes contributed by associations. */
export const addAssociationAttributes = (
  model: object,
  attributes: ModelAttributes,
): ModelDefinition => {
  updateState(model, (state) => {
    const extra = { ...state.input.extra, ...attributes };
    return {
      ...state,
      input: { ...state.input, extra },
      definition: normalizeDefinition(
        state.input.className,
        state.input.attributes,
        state.input.options,
        state.runtime.defaults,
        extra,
      ),
    };
  });
  const { definition } = stateOf(model);
  defineAttributeAccessors((model as { prototype: object }).prototype, definition);
  return definition;
};
