import { ValuesWriter } from './values-writer.ts';

const MAX_DEPTH = 32;
/** Marks a value the fast copy does not handle. */
const UNSUPPORTED = Symbol('postgrelize.unsupported');

/**
 * Deep copy of attribute values for `toJSON`. Rows hold primitives, dates, arrays and plain JSON
 * objects, which are copied directly; `structuredClone` is the slow general path, so it is used
 * for the whole value as soon as something else shows up (functions, symbols, class instances,
 * typed arrays, `Map`, cycles or an object reachable twice), which keeps its exact semantics.
 */
export class ValueCloner {
  readonly #writer = new ValuesWriter();

  /**
   * Copies a value like `structuredClone` does.
   *
   * @param value - Value to copy.
   * @returns The copy.
   * @throws DataCloneError for values `structuredClone` rejects (functions, symbols).
   */
  clone<T>(value: T): T {
    const copy = this.#copy(value, new Set(), 0);
    return copy === UNSUPPORTED ? structuredClone(value) : (copy as T);
  }

  #copy(value: unknown, seen: Set<object>, depth: number): unknown {
    if (value === null || typeof value !== 'object') {
      return typeof value === 'function' || typeof value === 'symbol' ? UNSUPPORTED : value;
    }
    if (depth > MAX_DEPTH || seen.has(value)) {
      return UNSUPPORTED;
    }
    seen.add(value);
    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    if (Array.isArray(value)) {
      return this.#array(value, seen, depth);
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null
      ? this.#object(value, seen, depth)
      : UNSUPPORTED;
  }

  #array(value: readonly unknown[], seen: Set<object>, depth: number): unknown {
    const copy: unknown[] = [];
    copy.length = value.length;
    for (let index = 0; index < value.length; index += 1) {
      if (index in value) {
        const item = this.#copy(value[index], seen, depth + 1);
        if (item === UNSUPPORTED) {
          return UNSUPPORTED;
        }
        copy[index] = item;
      }
    }
    return copy;
  }

  #object(value: object, seen: Set<object>, depth: number): unknown {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const itemCopy = this.#copy(item, seen, depth + 1);
      if (itemCopy === UNSUPPORTED) {
        return UNSUPPORTED;
      }
      this.#writer.set(copy, key, itemCopy);
    }
    return copy;
  }
}
