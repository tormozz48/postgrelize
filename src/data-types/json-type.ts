import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `JSON` / `JSONB`; values are serialized to JSON text.
 *
 * @internal
 */
export class JsonType extends AbstractDataType {
  /** Enables nested JSON where conditions. */
  readonly isJson = true;
  /** Converts a value into JSON text (`null` / `undefined` are kept). */
  readonly serialize = (value: unknown): unknown =>
    value === null || value === undefined ? value : JSON.stringify(value);

  /**
   * @param key - `'JSON'` or `'JSONB'` (also the SQL type).
   */
  constructor(key: 'JSON' | 'JSONB') {
    super(key, key);
    Object.freeze(this);
  }
}
