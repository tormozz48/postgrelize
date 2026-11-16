/** A `point` value. */
export type GeoPoint = Readonly<{
  /** Horizontal coordinate. */
  x: number;
  /** Vertical coordinate. */
  y: number;
}>;

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|-?Infinity|NaN/gi;

/**
 * Reads and writes the text form of geometric values.
 *
 * @internal
 */
export class GeometricText {
  /**
   * Extracts the numbers of a geometric literal, e.g. `((1,2),(3,4))` → `[1, 2, 3, 4]`.
   *
   * @param text - Literal returned by PostgreSQL.
   * @returns Numbers in order of appearance.
   */
  numbers(text: string): number[] {
    return (text.match(NUMBER) ?? []).map(Number);
  }

  /**
   * Groups numbers into points.
   *
   * @param values - Flat coordinates.
   * @returns One point per pair.
   */
  points(values: readonly number[]): GeoPoint[] {
    const result: GeoPoint[] = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      result.push({ x: values[index] ?? 0, y: values[index + 1] ?? 0 });
    }
    return result;
  }

  /**
   * Validates a coordinate before it is formatted.
   *
   * @param value - Coordinate.
   * @returns The value as text.
   * @throws Error when the value is not a finite number.
   */
  number(value: unknown): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Geometric coordinates must be finite numbers, got ${String(value)}`);
    }
    return String(value);
  }

  /**
   * Formats a point as `(x,y)`.
   *
   * @param value - Point-like value.
   * @returns Point text.
   */
  point(value: unknown): string {
    const point = this.#object(value);
    return `(${this.number(point['x'])},${this.number(point['y'])})`;
  }

  /**
   * Formats a list of points as `(x,y),(x,y)`.
   *
   * @param value - Array of points.
   * @returns Comma-joined point text.
   */
  list(value: unknown): string {
    if (!Array.isArray(value)) {
      throw new Error('Expected an array of points');
    }
    return value.map((item) => this.point(item)).join(',');
  }

  /**
   * Formats a pair of points (`lseg`, `box`).
   *
   * @param value - Array of exactly two points.
   * @returns Comma-joined point text.
   */
  pair(value: unknown): string {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error('Expected an array of two points');
    }
    return this.list(value);
  }

  #object(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`Expected an object, got ${String(value)}`);
    }
    return value as Record<string, unknown>;
  }

  /**
   * Narrows a value to an object for field access.
   *
   * @param value - Value to check.
   * @returns The value as a record.
   */
  fields(value: unknown): Record<string, unknown> {
    return this.#object(value);
  }
}
