import { AbstractDataType, type DataTypeInput } from './abstract-data-type.ts';
import { RangeType } from './range-type.ts';

const MULTIRANGE_SQL_TYPES: Readonly<Record<string, string>> = {
  INT4RANGE: 'INT4MULTIRANGE',
  INT8RANGE: 'INT8MULTIRANGE',
  NUMRANGE: 'NUMMULTIRANGE',
  TSRANGE: 'TSMULTIRANGE',
  TSTZRANGE: 'TSTZMULTIRANGE',
  DATERANGE: 'DATEMULTIRANGE',
};

/**
 * Multirange type (`DataTypes.MULTIRANGE(DataTypes.INTEGER)` → `INT4MULTIRANGE`, PostgreSQL 14+);
 * values are arrays of ranges, each a `[lower, upper]` pair like {@link RangeType} values.
 *
 * @internal
 */
export class MultirangeType extends AbstractDataType {
  /** Converts a driver multirange literal into an array of ranges (`[]` for `{}`). */
  readonly parse = (value: unknown): unknown => this.#parse(value);
  /** Converts an array of ranges into a multirange literal. */
  readonly serialize = (value: unknown): unknown => this.#serialize(value);
  readonly #range: RangeType;

  /**
   * @param subtype - Element type: `INTEGER`, `BIGINT`, `DECIMAL`, `TIMESTAMP`, `DATE` or `DATEONLY`.
   * @throws Error for any other element type.
   */
  constructor(subtype: DataTypeInput) {
    const range = new RangeType(subtype);
    super('MULTIRANGE', MULTIRANGE_SQL_TYPES[range.sqlType] ?? range.sqlType);
    this.#range = range;
    Object.freeze(this);
  }

  #serialize(value: unknown): unknown {
    if (!Array.isArray(value)) {
      return value;
    }
    return `{${value.map((range) => String(this.#range.serialize(range))).join(',')}}`;
  }

  #parse(value: unknown): unknown {
    if (typeof value !== 'string' || !value.startsWith('{')) {
      return value;
    }
    return MultirangeType.#split(value.slice(1, -1)).map((text) => this.#range.parse(text));
  }

  /** Splits at the commas that are outside brackets and quotes. */
  static #split(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (const [index, char] of [...body].entries()) {
      quoted = char === '"' ? !quoted : quoted;
      depth += quoted ? 0 : '[('.includes(char) ? 1 : '])'.includes(char) ? -1 : 0;
      if (char === ',' && depth === 0 && !quoted) {
        parts.push(body.slice(start, index));
        start = index + 1;
      }
    }
    return body === '' ? [] : [...parts, body.slice(start)];
  }
}
