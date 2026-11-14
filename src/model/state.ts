import { emptyHooks, type HookRegistry } from '../hooks/hooks.ts';
import type { StandardSchemaV1 } from '../validation/standard-schema.ts';
import type { ModelValidatorFunction } from '../validation/types.ts';
import type { ModelDefinition } from './definition.ts';
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
