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
   * Returns all attribute values of the instance; no query is run.
   *
   * @param options - `plain: true` returns a copy of all values with custom getters applied; `raw: true` skips custom getters.
   * @returns Values object.
   * @example
   * ```ts
   * const values = user.get({ plain: true });
   * ```
   */
  get(options?: Readonly<{ plain?: boolean; raw?: boolean; clone?: boolean }>): TAttributes;

  /**
   * Returns one attribute value, applying its custom getter unless `raw` is set.
   *
   * @param key - Attribute name.
   * @param options - `raw: true` skips the custom getter.
   * @returns Attribute value.
   * @example
   * ```ts
   * const email = user.get('email');
   * ```
   */
  get<K extends keyof TAttributes>(key: K, options?: Readonly<{ raw?: boolean }>): TAttributes[K];
  get(
    keyOrOptions?: string | number | symbol | Readonly<{ plain?: boolean; raw?: boolean }>,
    options: Readonly<{ raw?: boolean }> = {},
  ): unknown {
    return instanceValues.get(this as unknown as AnyModel, keyOrOptions, options);
  }

  /**
   * Sets one attribute value, applying its custom setter unless `raw` is set. Nothing is written to
   * the database until {@link Model.save}; the attribute is marked as changed when the value differs.
   *
   * @param key - Attribute name.
   * @param value - New value.
   * @param options - `raw: true` skips the custom setter and change tracking.
   * @returns This instance.
   * @example
   * ```ts
   * user.set('email', 'ada@example.com');
   * await user.save();
   * ```
   */
  set<K extends keyof TAttributes>(
    key: K,
    value: TAttributes[K],
    options?: Readonly<{ raw?: boolean }>,
  ): this;

  /**
   * Sets several attribute values at once, applying custom setters unless `raw` is set.
   *
   * @param values - Attribute values.
   * @param options - `raw: true` skips custom setters and change tracking.
   * @returns This instance.
   * @example
   * ```ts
   * user.set({ email: 'ada@example.com', active: true });
   * ```
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
   * Reads the stored value of an attribute, bypassing its custom getter.
   *
   * @param key - Attribute name.
   * @returns Raw value.
   * @example
   * ```ts
   * const stored = user.getDataValue('email');
   * ```
   */
  getDataValue<K extends keyof TAttributes>(key: K): TAttributes[K] {
    return this.dataValues[key];
  }

  /**
   * Writes the stored value of an attribute, bypassing its custom setter, and marks it as changed.
   *
   * @param key - Attribute name.
   * @param value - New value.
   * @returns This instance.
   * @example
   * ```ts
   * user.setDataValue('email', 'ada@example.com');
   * ```
   */
  setDataValue<K extends keyof TAttributes>(key: K, value: TAttributes[K]): this {
    instanceValues.setDataValue(this as unknown as AnyModel, key, value);
    return this;
  }

  /**
   * Lists the attributes changed since the instance was loaded or last saved.
   *
   * @returns Changed attribute names, or `false` when nothing changed.
   * @example
   * ```ts
   * user.set('email', 'ada@example.com');
   * const changedFields = user.changed();
   * ```
   */
  changed(): (keyof TAttributes & string)[] | false;

  /**
   * Checks whether one attribute changed since the instance was loaded or last saved.
   *
   * @param key - Attribute name.
   * @returns True when changed.
   */
  changed(key: keyof TAttributes & string): boolean;

  /**
   * Marks an attribute as changed or unchanged, which controls whether {@link Model.save} writes it.
   *
   * @param key - Attribute name.
   * @param value - Changed flag.
   */
  changed(key: keyof TAttributes & string, value: boolean): void;
  changed(key?: string, value?: boolean): unknown {
    return instanceValues.changed(this as unknown as AnyModel, key, value);
  }

  /**
   * Returns the value an attribute had before it was changed, or all previous values of changed
   * attributes when no key is given.
   *
   * @param key - Attribute name; omit to get all.
   * @returns Previous value(s).
   * @example
   * ```ts
   * user.set('email', 'ada@example.com');
   * const before = user.previous('email');
   * ```
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
   * Compares the primary keys of two instances.
   *
   * @param other - Instance to compare with.
   * @returns True when all primary key values are equal.
   * @example
   * ```ts
   * const other = User.build({ id: user.get('id') });
   * const same = user.equals(other);
   * ```
   */
  equals(other: Model): boolean {
    return instanceValues.equals(this as unknown as AnyModel, other);
  }

  /**
   * Returns a deep copy of the values with custom getters applied, used by `JSON.stringify`.
   *
   * @returns Plain object.
   * @example
   * ```ts
   * const json = JSON.stringify(user);
   * ```
   */
  toJSON(): TAttributes {
    return structuredClone(this.get({ plain: true }));
  }
}
