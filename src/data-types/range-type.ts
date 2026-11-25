import { AbstractDataType, type DataType, type DataTypeInput } from './abstract-data-type.ts';
import { WallClock } from './wall-clock.ts';

const wallClock = new WallClock();

/** Range bound as returned by Sequelize v6 for `RANGE` attributes. */
export type RangeBound<T> = Readonly<{
  /** Bound value; `null` for an unbounded side. */
  value: T | null;
  /** Whether the bound itself is part of the range. */
  inclusive: boolean;
}>;

const RANGE_SQL_TYPES: Readonly<Record<string, string>> = {
  INTEGER: 'INT4RANGE',
  BIGINT: 'INT8RANGE',
  DECIMAL: 'NUMRANGE',
  TIMESTAMP: 'TSRANGE',
  DATE: 'TSTZRANGE',
  DATEONLY: 'DATERANGE',
};

const RANGE_PATTERN = /^([[(])"?(.*?)"?,"?(.*?)"?([\])])$/;

/**
 * Range type (`DataTypes.RANGE(DataTypes.INTEGER)` → `INT4RANGE`); values are
 * `[lower, upper]` pairs of {@link RangeBound}s, like Sequelize v6.
 *
 * @internal
 */
export class RangeType extends AbstractDataType {
  /** Element type. */
  readonly subtype: DataType;
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ subtype: DataType }>;
  /** Converts a driver range literal into a pair of bounds (`[]` for `empty`). */
  readonly parse = (value: unknown): unknown => this.#parse(value);
  /** Converts a pair of values or bounds into a range literal. */
  readonly serialize = (value: unknown): unknown => this.#serialize(value);
  readonly #parseBound: ((value: unknown) => unknown) | undefined;

  /**
   * @param subtype - Element type: `INTEGER`, `BIGINT`, `DECIMAL`, `TIMESTAMP`, `DATE` or `DATEONLY`.
   * @throws Error for any other element type.
   */
  constructor(subtype: DataTypeInput) {
    const element = AbstractDataType.from(subtype);
    const sqlType = RANGE_SQL_TYPES[element.key];
    if (sqlType === undefined) {
      throw new Error(`RANGE does not support subtype ${element.key}`);
    }
    super('RANGE', sqlType);
    this.subtype = element;
    this.options = Object.freeze({ subtype: element });
    this.#parseBound =
      element.key === 'INTEGER' || element.key === 'BIGINT'
        ? (raw) => (typeof raw === 'string' ? Number.parseInt(raw, 10) : raw)
        : element.parse;
    Object.freeze(this);
  }

  #serialize(value: unknown): unknown {
    if (!Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return 'empty';
    }
    const lower = this.#toBound(value[0], true);
    const upper = this.#toBound(value[1], false);
    return `${lower.inclusive ? '[' : '('}${this.#formatBound(lower)},${this.#formatBound(upper)}${upper.inclusive ? ']' : ')'}`;
  }

  #toBound(bound: unknown, inclusive: boolean): RangeBound<unknown> {
    return typeof bound === 'object' && bound !== null && 'value' in bound && 'inclusive' in bound
      ? (bound as RangeBound<unknown>)
      : { value: bound ?? null, inclusive };
  }

  #formatBound(bound: RangeBound<unknown>): string {
    if (bound.value instanceof Date) {
      return this.subtype.key === 'TIMESTAMP'
        ? wallClock.format(bound.value)
        : bound.value.toISOString();
    }
    return bound.value === null ? '' : String(bound.value);
  }

  #parse(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }
    if (value === 'empty') {
      return [];
    }
    const match = RANGE_PATTERN.exec(value);
    if (match === null) {
      return value;
    }
    const [, open, low = '', high = '', close] = match;
    return [
      { value: this.#parseBoundValue(low), inclusive: open === '[' },
      { value: this.#parseBoundValue(high), inclusive: close === ']' },
    ];
  }

  #parseBoundValue(raw: string): unknown {
    return raw === '' ? null : this.#parseBound === undefined ? raw : this.#parseBound(raw);
  }
}
