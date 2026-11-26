const UNSAFE: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * `instance.set('column.a.b', value)` on a JSON column (v6, which uses `dottie`): the object is
 * changed in place, creating the objects missing on the way.
 *
 * @internal
 */
export class NestedJson {
  /**
   * @returns Whether the value at the path changed. Paths through `__proto__`, `constructor` or
   * `prototype` are ignored, so a key cannot reach a prototype.
   */
  write(
    values: Record<string, unknown>,
    path: readonly string[],
    value: unknown,
    isEqual: (left: unknown, right: unknown) => boolean,
  ): boolean {
    if (path.some((key) => UNSAFE.has(key))) {
      return false;
    }
    const target = this.#parent(values, path);
    const last = path.at(-1) as string;
    const previous = Object.hasOwn(target, last) ? target[last] : undefined;
    if (isEqual(value, previous)) {
      return false;
    }
    target[last] = value;
    return true;
  }

  #parent(values: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
    let target = values;
    for (const key of path.slice(0, -1)) {
      const own = Object.hasOwn(target, key) ? target[key] : undefined;
      target[key] = typeof own === 'object' && own !== null ? own : {};
      target = target[key] as Record<string, unknown>;
    }
    return target;
  }
}
