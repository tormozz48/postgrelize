/** GeoJSON geometry as produced by the EWKB reader. */
export type GeoJsonGeometry = Readonly<Record<string, unknown>>;

const HAS_Z = 0x80000000;
const HAS_M = 0x40000000;
const HAS_SRID = 0x20000000;

class Cursor {
  little = true;
  offset = 0;
  readonly #bytes: Buffer;

  constructor(bytes: Buffer) {
    this.#bytes = bytes;
  }

  byte(): number {
    return this.#bytes.readUInt8(this.offset++);
  }

  uint32(): number {
    const value = this.little
      ? this.#bytes.readUInt32LE(this.offset)
      : this.#bytes.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  float64(): number {
    const value = this.little
      ? this.#bytes.readDoubleLE(this.offset)
      : this.#bytes.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }
}

type Header = Readonly<{ type: number; z: boolean; m: boolean; srid: number | undefined }>;

/**
 * Reads hex-encoded EWKB (what PostGIS sends for `geometry` and `geography`) into GeoJSON.
 *
 * @internal
 */
export class EwkbReader {
  /**
   * Parses hex EWKB.
   *
   * @param hex - Hex string of an EWKB geometry.
   * @returns GeoJSON geometry; `crs` is set (`EPSG:<srid>`) when the EWKB carries an SRID, like v6.
   * @throws Error for a geometry type this reader does not support (curves, TIN, …).
   */
  parse(hex: string): GeoJsonGeometry {
    const cursor = new Cursor(Buffer.from(hex, 'hex'));
    const header = this.#header(cursor);
    const geometry = this.#geometry(cursor, header);
    return header.srid === undefined
      ? geometry
      : { ...geometry, crs: { type: 'name', properties: { name: `EPSG:${header.srid}` } } };
  }

  #header(cursor: Cursor): Header {
    cursor.little = cursor.byte() === 1;
    const raw = cursor.uint32();
    const srid = (raw & HAS_SRID) === 0 ? undefined : cursor.uint32();
    return { type: raw & 0xff, z: (raw & HAS_Z) !== 0, m: (raw & HAS_M) !== 0, srid };
  }

  #geometry(cursor: Cursor, header: Header): GeoJsonGeometry {
    const names = [
      '',
      'Point',
      'LineString',
      'Polygon',
      'MultiPoint',
      'MultiLineString',
      'MultiPolygon',
      'GeometryCollection',
    ];
    const type = names[header.type];
    if (type === undefined || type === '') {
      throw new Error(`Unsupported EWKB geometry type ${header.type}`);
    }
    if (header.type === 7) {
      return { type, geometries: this.#members(cursor) };
    }
    return { type, coordinates: this.#coordinates(cursor, header) };
  }

  #coordinates(cursor: Cursor, header: Header): unknown {
    switch (header.type) {
      case 1:
        return this.#position(cursor, header);
      case 2:
        return this.#list(cursor, () => this.#position(cursor, header));
      case 3:
        return this.#list(cursor, () => this.#list(cursor, () => this.#position(cursor, header)));
      default:
        return this.#members(cursor).map((member) => member['coordinates']);
    }
  }

  #members(cursor: Cursor): GeoJsonGeometry[] {
    return this.#list(cursor, () => {
      const header = this.#header(cursor);
      return this.#geometry(cursor, header);
    });
  }

  #list<T>(cursor: Cursor, item: () => T): T[] {
    const count = cursor.uint32();
    return Array.from({ length: count }, item);
  }

  #position(cursor: Cursor, header: Header): number[] {
    const position = [cursor.float64(), cursor.float64()];
    if (header.z) {
      position.push(cursor.float64());
    }
    if (header.m) {
      cursor.float64();
    }
    return Number.isNaN(position[0]) ? [] : position;
  }
}
