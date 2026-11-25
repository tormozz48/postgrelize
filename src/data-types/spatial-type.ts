import { AbstractDataType } from './abstract-data-type.ts';
import { EwkbReader } from './ewkb-reader.ts';
import { EwkbWriter } from './ewkb-writer.ts';

const HEX_EWKB = /^(?:[0-9a-fA-F]{2})+$/;

/**
 * PostGIS `GEOMETRY(type, srid)` / `GEOGRAPHY(type, srid)`; values are GeoJSON geometry objects
 * (reading hex EWKB, writing hex EWKB), like Sequelize v6.
 *
 * @internal
 */
export class SpatialType extends AbstractDataType {
  /** Converts hex EWKB into GeoJSON; other values (WKT, objects) are kept. */
  readonly parse = (value: unknown): unknown =>
    typeof value === 'string' && HEX_EWKB.test(value) ? new EwkbReader().parse(value) : value;
  /** Converts a GeoJSON object into hex EWKB bound as one parameter; text is kept. */
  readonly serialize = (value: unknown): unknown =>
    typeof value === 'object' && value !== null ? new EwkbWriter().write(value) : value;

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
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ type?: string; srid?: number }>;

  constructor(key: 'GEOMETRY' | 'GEOGRAPHY', shape?: string, srid?: number) {
    super(
      key,
      shape === undefined
        ? key
        : `${key}(${SpatialType.#shape(shape)}${srid === undefined ? '' : `,${AbstractDataType.integer(`${key} srid`, srid)}`})`,
    );
    this.options = Object.freeze({
      ...(shape === undefined ? {} : { type: shape }),
      ...(srid === undefined ? {} : { srid }),
    });
    Object.freeze(this);
  }
}
