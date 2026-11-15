import { AbstractDataType } from './abstract-data-type.ts';

/**
 * PostGIS `GEOMETRY(type, srid)` / `GEOGRAPHY(type, srid)`.
 *
 * @internal
 */
export class SpatialType extends AbstractDataType {
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
        : `${key}(${[shape, srid].filter((v) => v !== undefined).join(',')})`,
    );
    Object.freeze(this);
  }
}
