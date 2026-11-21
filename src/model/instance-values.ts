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
      return this.#getOne(instance, keyOrOptions, options);
    }
    return this.#getAll(instance, keyOrOptions);
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
      if (options.raw === true) {
        // Raw values bypass setters, so they can be copied in one step (as v6 does).
        Object.assign(instance.dataValues as Values, keyOrValues);
        return;
      }
      Object.entries(keyOrValues).forEach(([key, value]) =>
        instance.set(key, value as never, options),
      );
      return;
    }
    this.#setOne(instance, String(keyOrValues), valueOrOptions, maybeOptions ?? {});
  }

  #getOne(instance: AnyModel, key: string, options: SetOptions): unknown {
    const getter = this.#registry.definition(instance.constructor).attributes.get(key)?.get;
    return getter !== undefined && options.raw !== true
      ? (getter as (this: unknown) => unknown).call(instance)
      : (instance.dataValues as Values)[key];
  }

  #getAll(instance: AnyModel, options: GetOptions | number | symbol | undefined): Values {
    const raw = typeof options === 'object' && options.raw === true;
    const plain = typeof options === 'object' && options.plain === true;
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

  #setOne(instance: AnyModel, key: string, value: unknown, options: SetOptions): void {
    if (options.raw === true) {
      (instance.dataValues as Values)[key] = value;
      return;
    }
    const attribute = this.#registry.definition(instance.constructor).attributes.get(key);
    if (attribute === undefined) {
      return;
    }
    const values = instance.dataValues as Values;
    const original = values[key];
    if (attribute.set !== undefined) {
      (attribute.set as (this: unknown, value: unknown) => void).call(instance, value);
      this.#track(instance, key, original, values[key]);
      return;
    }
    this.#track(instance, key, original, value);
    values[key] = value;
  }

  /** v6 `set`: an attribute that differs from its value before the call stays changed for good. */
  #track(instance: AnyModel, key: string, original: unknown, value: unknown): void {
    if (value instanceof SqlExpression || !this.#values.isEqual(value, original)) {
      (instance._previousDataValues as Values)[key] = original;
      InstanceState.of(instance).mark(key, true);
    }
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
    const state = InstanceState.of(instance);
    if (
      !this.#values.isEqual((instance._previousDataValues as Values)[name], value) ||
      value instanceof SqlExpression
    ) {
      state.mark(name, true);
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
    const state = InstanceState.of(instance);
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
      [...InstanceState.of(instance).changed].map((name) => [
        name,
        (instance._previousDataValues as Values)[name],
      ]),
    );
  }

  /**
   * Row condition of an instance: primary key (and optionally version) values keyed by column name.
   *
   * @param instance - Model instance.
   * @param checkVersion - Include the version attribute.
   * @returns Where object, or the `whereCollection` option for models without a primary key.
   */
  where(instance: AnyModel, checkVersion: boolean): Values | undefined {
    const definition = this.#registry.definition(instance.constructor);
    const names = [
      ...definition.primaryKeys,
      ...(checkVersion && definition.version !== undefined ? [definition.version] : []),
    ];
    if (definition.primaryKeys.length === 0) {
      return (definition.options as Readonly<Record<string, unknown>>)['whereCollection'] as
        | Values
        | undefined;
    }
    return Object.fromEntries(
      names.map((name) => [
        definition.attributes.get(name)?.field ?? name,
        (instance.dataValues as Values)[name],
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
