import type { ModelDefinition } from './definition.ts';
import type { ModelRuntime, RuntimeOwner } from './runtime.ts';

/** Internal state of an initialized model class. */
export type ModelState = Readonly<{ definition: ModelDefinition; runtime: ModelRuntime }>;

/** @internal */
export const states = new WeakMap<object, ModelState>();

/** @internal */
export const sequelizes = new WeakMap<object, RuntimeOwner>();

export const stateOf = (model: object): ModelState => {
  const state = lookupState(model);
  if (state === undefined) {
    throw new Error('Model is not initialized. Call Model.init() or sequelize.define() first.');
  }
  return state;
};

const lookupState = (model: object | null): ModelState | undefined =>
  model === null
    ? undefined
    : (states.get(model) ?? lookupState(Object.getPrototypeOf(model) as object | null));
