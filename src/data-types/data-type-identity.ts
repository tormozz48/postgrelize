import { AbstractDataType } from './abstract-data-type.ts';

/** Type key → the key of the v6 class it extends. */
const PARENT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  CHAR: 'STRING',
  TINYINT: 'INTEGER',
  SMALLINT: 'INTEGER',
  MEDIUMINT: 'INTEGER',
  BIGINT: 'INTEGER',
  INTEGER: 'NUMBER',
  FLOAT: 'NUMBER',
  REAL: 'NUMBER',
  DOUBLE: 'NUMBER',
  DECIMAL: 'NUMBER',
  JSONB: 'JSON',
});

/**
 * Makes the type factories behave like the v6 classes: `value instanceof DataTypes.X` follows the type key and the v6
 * class hierarchy instead of a prototype chain, and `String(DataTypes.X)` is the key.
 *
 * @internal
 */
export class DataTypeIdentity {
  // bare factories (`DataTypes.STRING`) are stored as attribute types, so they count as instances
  readonly #bare = new WeakSet();

  mark(factory: object, key: string): void {
    this.#bare.add(factory);
    Object.defineProperties(factory, {
      [Symbol.hasInstance]: { value: (value: unknown): boolean => this.#is(value, key) },
      // v6 classes stringify to their key, so types work as object keys
      toString: { value: (): string => key },
    });
  }

  #is(value: unknown, key: string): boolean {
    if (!(value instanceof AbstractDataType) && !this.#bare.has(value as object)) {
      return false;
    }
    let current: string | undefined = (value as Readonly<{ key: string }>).key;
    while (current !== undefined && current !== key) {
      current = PARENT_KEYS[current];
    }
    return current === key;
  }
}
