import { AbstractDataType } from './abstract-data-type.ts';
import { GeometricText, type GeoPoint } from './geometric-text.ts';

/** Keys of the geometric data types. */
export type GeometricKey = 'POINT' | 'LINE' | 'LSEG' | 'BOX' | 'PATH' | 'POLYGON' | 'CIRCLE';

/** `path` value: `closed` paths are written `( … )`, open ones `[ … ]`. */
export type GeoPath = Readonly<{
  /** Vertices in order. */
  points: readonly GeoPoint[];
  /** True for a closed path. */
  closed: boolean;
}>;
/** `line` value: the line `a·x + b·y + c = 0`. */
export type GeoLine = Readonly<{
  /** Coefficient of `x`. */
  a: number;
  /** Coefficient of `y`. */
  b: number;
  /** Constant term. */
  c: number;
}>;
/** `circle` value: center and radius. */
export type GeoCircle = Readonly<{
  /** Center x. */
  x: number;
  /** Center y. */
  y: number;
  /** Radius. */
  radius: number;
}>;

type Codec = Readonly<{
  parse: (numbers: number[], text: string) => unknown;
  format: (value: unknown) => string;
}>;

const text = new GeometricText();

const CODECS: Readonly<Record<GeometricKey, Codec>> = {
  POINT: {
    parse: (n) => text.points(n)[0],
    format: (value) => text.point(value),
  },
  LINE: {
    parse: ([a = 0, b = 0, c = 0]) => ({ a, b, c }),
    format: (value) => {
      const line = text.fields(value);
      return `{${text.number(line['a'])},${text.number(line['b'])},${text.number(line['c'])}}`;
    },
  },
  LSEG: {
    parse: (n) => text.points(n),
    format: (value) => `[${text.pair(value)}]`,
  },
  BOX: {
    parse: (n) => text.points(n),
    format: (value) => text.pair(value),
  },
  PATH: {
    parse: (n, literal) => ({ points: text.points(n), closed: !literal.startsWith('[') }),
    format: (value) => {
      const path = text.fields(value);
      const points = text.list(path['points']);
      return path['closed'] === false ? `[${points}]` : `(${points})`;
    },
  },
  POLYGON: {
    parse: (n) => text.points(n),
    format: (value) => `(${text.list(value)})`,
  },
  CIRCLE: {
    parse: ([x = 0, y = 0, radius = 0]) => ({ x, y, radius }),
    format: (value) => {
      const circle = text.fields(value);
      return `<${text.point(circle)},${text.number(circle['radius'])}>`;
    },
  },
};

/**
 * Geometric types (`DataTypes.POINT`, `LINE`, `LSEG`, `BOX`, `PATH`, `POLYGON`, `CIRCLE`); values
 * are plain objects and arrays of points.
 *
 * @internal
 */
export class GeometricType extends AbstractDataType {
  /** Converts a driver literal into the value shape; non-text values are kept. */
  readonly parse = (value: unknown): unknown =>
    typeof value === 'string' ? CODECS[this.#key].parse(text.numbers(value), value.trim()) : value;
  /** Converts a value into a literal bound as one parameter; text and `null` are kept. */
  readonly serialize = (value: unknown): unknown =>
    value === null || value === undefined || typeof value === 'string'
      ? value
      : CODECS[this.#key].format(value);
  readonly #key: GeometricKey;

  /**
   * @param key - Geometric type key; also the SQL type name.
   */
  constructor(key: GeometricKey) {
    super(key, key);
    this.#key = key;
    Object.freeze(this);
  }
}
