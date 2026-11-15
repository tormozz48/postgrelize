import { AbstractDataType } from './abstract-data-type.ts';

/** Key/value pairs of an `HSTORE` column: values are strings, or `null` for SQL `NULL`. */
export type HstoreValue = Readonly<Record<string, string | null>>;

const PAIR = /"((?:[^"\\]|\\.)*)"\s*=>\s*(?:NULL|"((?:[^"\\]|\\.)*)")/g;

/**
 * `HSTORE` (`DataTypes.HSTORE`); values are plain objects, like Sequelize v6 with `pg-hstore`.
 *
 * @internal
 */
export class HstoreType extends AbstractDataType {
  /** Converts hstore text into an object; values are strings or `null`. */
  readonly parse = (value: unknown): unknown =>
    typeof value === 'string' ? HstoreType.#parse(value) : value;
  /** Converts an object into hstore text; non-object values (e.g. hstore text) are kept. */
  readonly serialize = (value: unknown): unknown =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? HstoreType.#serialize(value)
      : value;

  constructor() {
    super('HSTORE', 'HSTORE');
    Object.freeze(this);
  }

  static #quote(text: string): string {
    return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  }

  static #unquote(text: string): string {
    return text.replaceAll(/\\(.)/g, '$1');
  }

  static #text(value: unknown): string {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  static #serialize(value: object): string {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(
        ([key, item]) =>
          `${HstoreType.#quote(key)}=>${item === null ? 'NULL' : HstoreType.#quote(HstoreType.#text(item))}`,
      )
      .join(',');
  }

  static #parse(text: string): Record<string, string | null> {
    const result: Record<string, string | null> = {};
    for (const match of text.matchAll(PAIR)) {
      result[HstoreType.#unquote(match[1] ?? '')] =
        match[2] === undefined ? null : HstoreType.#unquote(match[2]);
    }
    return result;
  }
}
