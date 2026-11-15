import { instanceValues } from './model-services.ts';
import type { Model } from './model.ts';
import type { AnyModel, Values } from './options.ts';

/**
 * Value access of model instances: `get`, `set`, `getDataValue`, `setDataValue`, `changed`, `previous`, `equals`, `toJSON`.
 *
 * @internal
 */
export class ModelInstanceValues<TAttributes extends object = Values> {
  /** Current attribute values. */
  declare dataValues: TAttributes;

  /**
   * Returns attribute values.
   *
   * @param options - `plain: true` returns a copy of all values with custom getters applied.
   * @returns Values object.
   */
  get(options?: Readonly<{ plain?: boolean; raw?: boolean; clone?: boolean }>): TAttributes;

  /**
   * Returns one attribute value, applying its custom getter unless `raw` is set.
   *
   * @param key - Attribute name.
   * @param options - `raw: true` skips the custom getter.
   * @returns Attribute value.
   */
  get<K extends keyof TAttributes>(key: K, options?: Readonly<{ raw?: boolean }>): TAttributes[K];
  get(
    keyOrOptions?: string | number | symbol | Readonly<{ plain?: boolean; raw?: boolean }>,
    options: Readonly<{ raw?: boolean }> = {},
  ): unknown {
    return instanceValues.get(this as unknown as AnyModel, keyOrOptions, options);
  }

  /**
   * Sets one attribute value, applying its custom setter unless `raw` is set.
   *
   * @param key - Attribute name.
   * @param value - New value.
   * @param options - `raw: true` skips the custom setter and change tracking.
   * @returns This instance.
   */
  set<K extends keyof TAttributes>(
    key: K,
    value: TAttributes[K],
    options?: Readonly<{ raw?: boolean }>,
  ): this;

  /**
   * Sets several attribute values.
   *
   * @param values - Attribute values.
   * @param options - `raw: true` skips custom setters and change tracking.
   * @returns This instance.
   */
  set(values: Partial<TAttributes> | Values, options?: Readonly<{ raw?: boolean }>): this;
  set(
    keyOrValues: string | number | symbol | Values,
    valueOrOptions?: unknown,
    maybeOptions?: Readonly<{ raw?: boolean }>,
  ): this {
    instanceValues.set(this as unknown as AnyModel, keyOrValues, valueOrOptions, maybeOptions);
    return this;
  }

  /**
   * Reads a value without custom getters.
   *
   * @param key - Attribute name.
   * @returns Raw value.
   */
  getDataValue<K extends keyof TAttributes>(key: K): TAttributes[K] {
    return this.dataValues[key];
  }

  /**
   * Writes a value without custom setters, tracking the change.
   *
   * @param key - Attribute name.
   * @param value - New value.
   * @returns This instance.
   */
  setDataValue<K extends keyof TAttributes>(key: K, value: TAttributes[K]): this {
    instanceValues.setDataValue(this as unknown as AnyModel, key, value);
    return this;
  }

  /**
   * Lists changed attributes, or checks one.
   *
   * @returns Changed attribute names, or `false` when nothing changed.
   */
  changed(): (keyof TAttributes & string)[] | false;

  /**
   * Checks whether an attribute changed.
   *
   * @param key - Attribute name.
   * @returns True when changed.
   */
  changed(key: keyof TAttributes & string): boolean;

  /**
   * Marks an attribute as changed or unchanged.
   *
   * @param key - Attribute name.
   * @param value - Changed flag.
   */
  changed(key: keyof TAttributes & string, value: boolean): void;
  changed(key?: string, value?: boolean): unknown {
    return instanceValues.changed(this as unknown as AnyModel, key, value);
  }

  /**
   * Previous value of an attribute, or all previous values of changed attributes.
   *
   * @param key - Attribute name.
   * @returns Previous value(s).
   */
  previous<K extends keyof TAttributes>(
    key?: K,
  ): TAttributes[K] | Partial<TAttributes> | undefined {
    return instanceValues.previous(this as unknown as AnyModel, key) as
      | TAttributes[K]
      | Partial<TAttributes>
      | undefined;
  }

  /**
   * Compares primary keys with another instance.
   *
   * @param other - Instance to compare with.
   * @returns True when all primary key values are equal.
   */
  equals(other: Model): boolean {
    return instanceValues.equals(this as unknown as AnyModel, other);
  }

  /**
   * Plain copy of all values with custom getters applied.
   *
   * @returns Plain object.
   */
  toJSON(): TAttributes {
    return structuredClone(this.get({ plain: true }));
  }
}
