import { SqlExpression } from '../expressions/methods.ts';
import { InstanceState } from './instance-state.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { ModelValues } from './model-values.ts';
import type { AnyModel, Values } from './options.ts';

/** Tells model instances apart from plain values (injected to avoid importing `Model`). */
export type InstanceCheck = (value: unknown) => value is AnyModel;

/** Options of `instance.get()`. */
export type GetOptions = Readonly<{ plain?: boolean; raw?: boolean; clone?: boolean }>;

/** Options of `instance.set()`. */
export type SetOptions = Readonly<{ raw?: boolean }>;

/**
 * Attribute access of model instances (Sequelize v6 `get` / `set` / `setDataValue` / `changed` /
 * `previous` / `equals`): custom getters and setters, plain conversion of nested instances and
 * change tracking.
 */
export class InstanceValues {
  readonly #registry: ModelRegistry;
  readonly #values: ModelValues;
  readonly #isInstance: InstanceCheck;

  /**
   * @param registry - Model definitions.
   * @param values - Value equality.
   * @param isInstance - Checks whether a value is a model instance.
   */
  constructor(registry: ModelRegistry, values: ModelValues, isInstance: InstanceCheck) {
    this.#registry = registry;
    this.#values = values;
    this.#isInstance = isInstance;
  }

  /**
   * One attribute value (custom getter applied unless `raw`), or all values.
   *
   * @param instance - Model instance.
   * @param keyOrOptions - Attribute name, or options for all values.
   * @param options - `raw: true` skips the custom getter.
   * @returns Attribute value or values object.
   */
  get(
    instance: AnyModel,
    keyOrOptions: string | number | symbol | GetOptions | undefined,
    options: SetOptions,
  ): unknown {
    if (typeof keyOrOptions === 'string') {
      const getter = this.#registry
        .definition(instance.constructor)
        .attributes.get(keyOrOptions)?.get;
      return getter !== undefined && options.raw !== true
        ? (getter as (this: unknown) => unknown).call(instance)
        : (instance.dataValues as Values)[keyOrOptions];
    }
    const raw = typeof keyOrOptions === 'object' && keyOrOptions.raw === true;
    const plain = typeof keyOrOptions === 'object' && keyOrOptions.plain === true;
    const toPlain = (value: unknown): unknown =>
      !plain
        ? value
        : this.#isInstance(value)
          ? value.get({ plain: true })
          : Array.isArray(value) && value.some((item) => this.#isInstance(item))
            ? value.map(toPlain)
            : value;
    return Object.fromEntries(
      Object.keys(instance.dataValues).map((key) => [
        key,
        toPlain(raw ? (instance.dataValues as Values)[key] : instance.get(key)),
      ]),
    );
  }

  /**
   * Sets one attribute (custom setter applied unless `raw`) or several.
   *
   * @param instance - Model instance.
   * @param keyOrValues - Attribute name or values.
   * @param valueOrOptions - Value, or options when setting several values.
   * @param maybeOptions - Options when setting one value.
   */
  set(
    instance: AnyModel,
    keyOrValues: string | number | symbol | Values,
    valueOrOptions: unknown,
    maybeOptions: SetOptions | undefined,
  ): void {
    if (typeof keyOrValues === 'object') {
      const options = (valueOrOptions ?? {}) as SetOptions;
      Object.entries(keyOrValues).forEach(([key, value]) =>
        instance.set(key, value as never, options),
      );
      return;
    }
    const key = String(keyOrValues);
    const options = maybeOptions ?? {};
    const attribute = this.#registry.definition(instance.constructor).attributes.get(key);
    if (options.raw === true) {
      (instance.dataValues as Values)[key] = valueOrOptions;
      return;
    }
    if (attribute === undefined) {
      return;
    }
    if (attribute.set !== undefined) {
      (attribute.set as (this: unknown, value: unknown) => void).call(instance, valueOrOptions);
      return;
    }
    instance.setDataValue(key, valueOrOptions as never);
  }

  /**
   * Writes a value without custom setters, tracking the change.
   *
   * @param instance - Model instance.
   * @param key - Attribute name.
   * @param value - New value.
   */
  setDataValue(instance: AnyModel, key: string | number | symbol, value: unknown): void {
    const name = String(key);
    const state = instance[InstanceState.key]();
    if (
      !this.#values.isEqual((instance._previousDataValues as Values)[name], value) ||
      value instanceof SqlExpression
    ) {
      state.mark(name, true);
    } else if (state.changed.has(name)) {
      state.mark(name, false);
    }
    (instance.dataValues as Values)[name] = value;
  }

  /**
   * Lists changed attributes, checks one, or marks one as changed / unchanged.
   *
   * @param instance - Model instance.
   * @param key - Attribute name.
   * @param value - Changed flag.
   * @returns Names (or `false`), a flag, or `undefined` when marking.
   */
  changed(instance: AnyModel, key: string | undefined, value: boolean | undefined): unknown {
    const state = instance[InstanceState.key]();
    if (key === undefined) {
      return state.changed.size === 0 ? false : [...state.changed];
    }
    if (value === undefined) {
      return state.changed.has(key);
    }
    state.mark(key, value);
    return undefined;
  }

  /**
   * Previous value of an attribute, or all previous values of changed attributes.
   *
   * @param instance - Model instance.
   * @param key - Attribute name.
   * @returns Previous value(s).
   */
  previous(instance: AnyModel, key: string | number | symbol | undefined): unknown {
    if (key !== undefined) {
      return (instance._previousDataValues as Record<string | number | symbol, unknown>)[key];
    }
    return Object.fromEntries(
      [...instance[InstanceState.key]().changed].map((name) => [
        name,
        (instance._previousDataValues as Values)[name],
      ]),
    );
  }

  /**
   * Compares primary keys of two instances of the same model.
   *
   * @param instance - Model instance.
   * @param other - Instance to compare with.
   * @returns True when `other` is an instance of the model and all primary keys are equal.
   */
  equals(instance: AnyModel, other: AnyModel): boolean {
    const definition = this.#registry.definition(instance.constructor);
    return (
      other instanceof (instance.constructor as abstract new (...args: never[]) => unknown) &&
      definition.primaryKeys.every((name) =>
        this.#values.isEqual(
          (instance.dataValues as Values)[name],
          (other.dataValues as Values)[name],
        ),
      )
    );
  }
}
