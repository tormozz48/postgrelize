import { AbstractDataType } from './abstract-data-type.ts';

/**
 * PostGIS `GEOMETRY(type, srid)` / `GEOGRAPHY(type, srid)`.
 *
 * @internal
 */
export class SpatialType extends AbstractDataType {
  static #shape(shape: string): string {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(shape)) {
      throw new Error(`Invalid spatial type: ${shape}`);
    }
    return shape;
  }

  /**
   * @param key - `'GEOMETRY'` or `'GEOGRAPHY'` (also the SQL type name).
   * @param shape - Geometry type, e.g. `'POINT'`.
   * @param srid - Spatial reference id.
   */
  constructor(key: 'GEOMETRY' | 'GEOGRAPHY', shape?: string, srid?: number) {
    super(
      key,
      shape === undefined
        ? key
        : `${key}(${SpatialType.#shape(shape)}${srid === undefined ? '' : `,${AbstractDataType.integer(`${key} srid`, srid)}`})`,
    );
    Object.freeze(this);
  }
}
