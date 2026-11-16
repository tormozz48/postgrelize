import type { DataType } from './abstract-data-type.ts';
import { WallClock } from './wall-clock.ts';

const NUMERIC = new Set(['INTEGER', 'SMALLINT', 'TINYINT', 'MEDIUMINT', 'FLOAT', 'REAL', 'DOUBLE']);
const wallClock = new WallClock();

/**
 * Converts single composite fields between JavaScript values and field text.
 *
 * @internal
 */
export class CompositeFields {
  /**
   * Converts field text read from a record into the field's value.
   *
   * @param field - Field type.
   * @param text - Field text, or `null` for NULL.
   * @returns The value.
   */
  fromText(field: DataType, text: string | null): unknown {
    if (text === null) {
      return null;
    }
    if (field.parse !== undefined) {
      return field.parse(text);
    }
    if (NUMERIC.has(field.key)) {
      return Number(text);
    }
    return this.#byKey(field.key, text);
  }

  /**
   * Converts a field value into field text.
   *
   * @param field - Field type.
   * @param value - Value; `null` / `undefined` are NULL.
   * @returns Field text, or `null` for NULL.
   * @throws Error for array values (not supported inside composites).
   */
  toText(field: DataType, value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const converted = field.serialize === undefined ? value : field.serialize(value);
    if (field.isJson === true) {
      return JSON.stringify(value);
    }
    if (Array.isArray(converted)) {
      throw new Error('Composite fields do not support array values');
    }
    return this.#text(field, converted);
  }

  #byKey(key: string, text: string): unknown {
    switch (key) {
      case 'BOOLEAN':
        return text === 't';
      case 'DATE':
        return new Date(text);
      case 'BLOB':
        return Buffer.from(text.slice(2), 'hex');
      default:
        return key === 'JSON' || key === 'JSONB' ? JSON.parse(text) : text;
    }
  }

  #text(field: DataType, value: unknown): string {
    if (value instanceof Date) {
      return field.key === 'TIMESTAMP' ? wallClock.format(value) : value.toISOString();
    }
    if (typeof value === 'boolean') {
      return value ? 't' : 'f';
    }
    if (Buffer.isBuffer(value)) {
      return `\\x${value.toString('hex')}`;
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
