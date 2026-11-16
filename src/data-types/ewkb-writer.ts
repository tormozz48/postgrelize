const HAS_Z = 0x80000000;
const HAS_SRID = 0x20000000;
const DEFAULT_SRID = 4326;

const TYPE_CODES: Readonly<Record<string, number>> = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
  GeometryCollection: 7,
};

type Geometry = Readonly<Record<string, unknown>>;

/**
 * Writes GeoJSON as hex-encoded EWKB, which `geometry` and `geography` accept as text input, so a
 * value is one bound parameter.
 *
 * @internal
 */
export class EwkbWriter {
  readonly #parts: Buffer[] = [];

  /**
   * Converts a GeoJSON geometry to hex EWKB.
   *
   * @param value - GeoJSON geometry object; `crs` (`EPSG:<srid>`) sets the SRID, default 4326.
   * @returns Hex EWKB.
   * @throws Error for an unknown geometry type or malformed coordinates.
   */
  write(value: unknown): string {
    const geometry = this.#object(value);
    const z = this.#hasZ(geometry);
    this.#geometry(geometry, z, this.#srid(geometry));
    return Buffer.concat(this.#parts.splice(0)).toString('hex');
  }

  #object(value: unknown): Geometry {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Expected a GeoJSON geometry object');
    }
    return value as Geometry;
  }

  #srid(geometry: Geometry): number {
    const crs = geometry['crs'] as { properties?: { name?: unknown } } | undefined;
    const name = crs?.properties?.name;
    const match = typeof name === 'string' ? /EPSG:+(\d+)$/.exec(name) : null;
    return match === null ? DEFAULT_SRID : Number(match[1]);
  }

  #hasZ(geometry: Geometry): boolean {
    let node: unknown = geometry['coordinates'] ?? (geometry['geometries'] as unknown[])?.[0];
    while (Array.isArray(node) && typeof node[0] !== 'number' && node.length > 0) {
      node = node[0];
    }
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      return this.#hasZ(node as Geometry);
    }
    return Array.isArray(node) && node.length === 3;
  }

  #geometry(geometry: Geometry, z: boolean, srid?: number): void {
    const code = TYPE_CODES[String(geometry['type'])];
    if (code === undefined) {
      throw new Error(`Unsupported GeoJSON geometry type ${String(geometry['type'])}`);
    }
    this.#parts.push(
      Buffer.from([1]),
      this.#uint32((code | (z ? HAS_Z : 0) | (srid === undefined ? 0 : HAS_SRID)) >>> 0),
    );
    if (srid !== undefined) {
      this.#parts.push(this.#uint32(srid));
    }
    this.#body(code, geometry, z);
  }

  #body(code: number, geometry: Geometry, z: boolean): void {
    if (code === 7) {
      this.#items(geometry['geometries'], (member) => this.#geometry(this.#object(member), z));
    } else if (code === 1) {
      this.#position(geometry['coordinates'], z);
    } else if (code === 2) {
      this.#items(geometry['coordinates'], (position) => this.#position(position, z));
    } else if (code === 3) {
      this.#items(geometry['coordinates'], (ring) =>
        this.#items(ring, (position) => this.#position(position, z)),
      );
    } else {
      this.#items(geometry['coordinates'], (member) =>
        this.#geometry({ type: String(geometry['type']).slice(5), coordinates: member }, z),
      );
    }
  }

  #items(value: unknown, write: (item: unknown) => void): void {
    if (!Array.isArray(value)) {
      throw new TypeError('GeoJSON coordinates must be arrays');
    }
    this.#parts.push(this.#uint32(value.length));
    value.forEach(write);
  }

  #position(value: unknown, z: boolean): void {
    const valid = Array.isArray(value) && value.length === (z ? 3 : 2);
    if (!valid || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
      throw new Error('GeoJSON positions must be arrays of finite numbers of equal length');
    }
    for (const coordinate of value as number[]) {
      const bytes = Buffer.alloc(8);
      bytes.writeDoubleLE(coordinate);
      this.#parts.push(bytes);
    }
  }

  #uint32(value: number): Buffer {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(value);
    return bytes;
  }
}
