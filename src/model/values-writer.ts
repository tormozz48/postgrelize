/** Writes attribute values into plain objects built from driver rows. */
export class ValuesWriter {
  /**
   * Sets a value as an own property. A column called `__proto__` stays an own property, like it
   * does with `Object.fromEntries`, instead of replacing the object's prototype.
   *
   * @param values - Target object.
   * @param name - Property name.
   * @param value - Property value.
   */
  set(values: Record<string, unknown>, name: string, value: unknown): void {
    if (name === '__proto__') {
      Object.defineProperty(values, name, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      values[name] = value;
    }
  }
}
