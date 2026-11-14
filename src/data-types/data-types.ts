import { randomUUID } from 'node:crypto';

/**
 * Description of a column type: its SQL type and conversions between JavaScript values and the
 * values sent to / received from PostgreSQL.
 */
export type DataType = Readonly<{
  /** Sequelize v6 type key, e.g. `'STRING'`. */
  key: string;
  /** PostgreSQL column type, e.g. `'VARCHAR(255)'`. */
  sqlType: string;
  /** True for `JSON` and `JSONB`; enables nested JSON where conditions. */
  isJson?: boolean;
  /** True for `VIRTUAL`: the attribute is not stored in the database. */
  isVirtual?: boolean;
  /** Element type for `ARRAY` and `RANGE`. */
  subtype?: DataType;
  /** Allowed values for `ENUM`. */
  values?: readonly string[];
  /** Converts a value read from the driver into the attribute value. */
  parse?: (value: unknown) => unknown;
  /** Converts an attribute value into a driver parameter. */
  serialize?: (value: unknown) => unknown;
}>;

/** A data type used as is (`DataTypes.INTEGER`) or after calling it (`DataTypes.STRING(64)`). */
export type DataTypeInput = DataType | ((...args: never[]) => DataType);

/** Integer type with Sequelize v6 MySQL-only modifiers kept as no-ops for compatibility. */
export type IntegerDataType = DataType &
  Readonly<{
    /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
    UNSIGNED: IntegerDataType;
    /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
    ZEROFILL: IntegerDataType;
  }>;

/** Default value marker: generates a value on the client when a row is built. */
export type DefaultValueGenerator = Readonly<{
  /** Sequelize v6 type key, e.g. `'UUIDV4'`. */
  key: string;
  /** Produces the default value. */
  generate: () => unknown;
}>;

/** Range bound as returned by Sequelize v6 for `RANGE` attributes. */
export type RangeBound<T> = Readonly<{ value: T | null; inclusive: boolean }>;

const type = (key: string, sqlType: string, extra: Partial<DataType> = {}): DataType =>
  Object.freeze({ key, sqlType, ...extra });

/** Makes a type usable both bare and called, like `DataTypes.STRING` and `DataTypes.STRING(64)`. */
const callable = <A extends unknown[], T extends DataType>(
  build: (...args: A) => T,
  bare: T,
): ((...args: A) => T) & T => Object.freeze(Object.assign((...args: A) => build(...args), bare));

const integer = (key: string, sqlType: string): IntegerDataType => {
  const base = type(key, sqlType);
  const self: IntegerDataType = Object.freeze(
    Object.defineProperties(
      { ...base },
      {
        UNSIGNED: { get: () => self, enumerable: false },
        ZEROFILL: { get: () => self, enumerable: false },
      },
    ) as IntegerDataType,
  );
  return self;
};

const precision = (name: string, digits?: number, scale?: number): string =>
  digits === undefined
    ? name
    : `${name}(${[digits, scale].filter((n) => n !== undefined).join(',')})`;

const stringifyJson = (value: unknown): unknown =>
  value === null || value === undefined ? value : JSON.stringify(value);

const formatRangeValue = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);

const isRangeBound = (value: unknown): value is RangeBound<unknown> =>
  typeof value === 'object' && value !== null && 'value' in value && 'inclusive' in value;

const toRangeBound = (bound: unknown, inclusive: boolean): RangeBound<unknown> =>
  isRangeBound(bound) ? bound : { value: bound ?? null, inclusive };

const formatRangeBound = (bound: RangeBound<unknown>): string =>
  bound.value === null ? '' : formatRangeValue(bound.value);

const serializeRange = (value: unknown): unknown => {
  if (!Array.isArray(value)) {
    return value;
  }
  if (value.length === 0) {
    return 'empty';
  }
  const lower = toRangeBound(value[0], true);
  const upper = toRangeBound(value[1], false);
  return `${lower.inclusive ? '[' : '('}${formatRangeBound(lower)},${formatRangeBound(upper)}${upper.inclusive ? ']' : ')'}`;
};

const parseRangeBound = (subtype: DataType, raw: string): unknown =>
  raw === '' ? null : subtype.parse === undefined ? raw : subtype.parse(raw);

const RANGE_PATTERN = /^([[(])"?(.*?)"?,"?(.*?)"?([\])])$/;

const parseRange =
  (subtype: DataType) =>
  (value: unknown): unknown => {
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
      { value: parseRangeBound(subtype, low), inclusive: open === '[' },
      { value: parseRangeBound(subtype, high), inclusive: close === ']' },
    ];
  };

const parseIntegerString = (value: unknown): unknown =>
  typeof value === 'string' ? Number.parseInt(value, 10) : value;

const parseDate = (value: unknown): unknown =>
  typeof value === 'string' ? new Date(value) : value;

/** @internal */
export const toDataType = (input: DataTypeInput): DataType =>
  typeof input === 'function' ? (input as unknown as DataType) : input;

const stringType = (length = 255): DataType => type('STRING', `VARCHAR(${length})`);
const charType = (length = 255): DataType => type('CHAR', `CHAR(${length})`);
const textType = (_size?: 'tiny' | 'medium' | 'long'): DataType => type('TEXT', 'TEXT');
const decimalType = (digits?: number, scale?: number): DataType =>
  type('DECIMAL', precision('DECIMAL', digits, scale));
const floatType = (digits?: number): DataType => type('FLOAT', precision('FLOAT', digits));
const dateType = (fsp?: number): DataType =>
  type(
    'DATE',
    fsp === undefined ? 'TIMESTAMP WITH TIME ZONE' : `TIMESTAMP(${fsp}) WITH TIME ZONE`,
    {
      parse: parseDate,
    },
  );
const arrayType = (subtype: DataTypeInput): DataType => {
  const element = toDataType(subtype);
  return type('ARRAY', `${element.sqlType}[]`, {
    subtype: element,
    ...(element.serialize === undefined
      ? {}
      : {
          serialize: (value: unknown) =>
            Array.isArray(value) ? value.map((item) => element.serialize?.(item)) : value,
        }),
  });
};
const rangeSqlType: Readonly<Record<string, string>> = {
  INTEGER: 'INT4RANGE',
  BIGINT: 'INT8RANGE',
  DECIMAL: 'NUMRANGE',
  DATE: 'TSTZRANGE',
  DATEONLY: 'DATERANGE',
};
const rangeType = (subtype: DataTypeInput = INTEGER): DataType => {
  const element = toDataType(subtype);
  const sqlType = rangeSqlType[element.key];
  if (sqlType === undefined) {
    throw new Error(`RANGE does not support subtype ${element.key}`);
  }
  return type('RANGE', sqlType, {
    subtype: element,
    parse: parseRange(
      element.key === 'INTEGER' || element.key === 'BIGINT'
        ? { ...element, parse: parseIntegerString }
        : element,
    ),
    serialize: serializeRange,
  });
};
const enumType = (
  ...args: readonly (string | readonly string[] | Readonly<{ values: readonly string[] }>)[]
): DataType => {
  const values = args.flatMap((arg) =>
    typeof arg === 'string'
      ? [arg]
      : Array.isArray(arg)
        ? arg
        : (arg as Readonly<{ values: readonly string[] }>).values,
  );
  return type('ENUM', 'ENUM', { values });
};
const virtualType = (returnType?: DataTypeInput, _fields?: readonly string[]): DataType =>
  type('VIRTUAL', returnType === undefined ? 'VIRTUAL' : toDataType(returnType).sqlType, {
    isVirtual: true,
  });

const spatialType = (key: string, shape?: string, srid?: number): DataType =>
  type(
    key,
    shape === undefined ? key : `${key}(${[shape, srid].filter((v) => v !== undefined).join(',')})`,
  );

const INTEGER = integer('INTEGER', 'INTEGER');

/**
 * Column types, API-compatible with Sequelize v6 `DataTypes` for PostgreSQL.
 *
 * `BIGINT` and `DECIMAL` values are returned as strings (like Sequelize v6) to avoid precision loss.
 *
 * @example
 * ```ts
 * User.init({ id: { type: DataTypes.BIGINT, primaryKey: true }, name: DataTypes.STRING(64) }, { sequelize });
 * ```
 */
export const DataTypes = {
  /** `VARCHAR(length)`, default length 255. */
  STRING: callable(stringType, stringType()),
  /** `CHAR(length)`, default length 255. */
  CHAR: callable(charType, charType()),
  /** `TEXT`. The size argument is accepted for compatibility and ignored. */
  TEXT: callable(textType, textType()),
  /** `CITEXT` (case-insensitive text, requires the `citext` extension). */
  CITEXT: type('CITEXT', 'CITEXT'),
  /** `INTEGER`. */
  INTEGER,
  /** `SMALLINT`. */
  SMALLINT: integer('SMALLINT', 'SMALLINT'),
  /** Mapped to `SMALLINT` (PostgreSQL has no `TINYINT`). */
  TINYINT: integer('TINYINT', 'SMALLINT'),
  /** Mapped to `INTEGER` (PostgreSQL has no `MEDIUMINT`). */
  MEDIUMINT: integer('MEDIUMINT', 'INTEGER'),
  /** `BIGINT`; values are returned as strings. */
  BIGINT: integer('BIGINT', 'BIGINT'),
  /** `FLOAT(precision)`. */
  FLOAT: callable(floatType, floatType()),
  /** `REAL`. */
  REAL: type('REAL', 'REAL'),
  /** `DOUBLE PRECISION`. */
  DOUBLE: type('DOUBLE', 'DOUBLE PRECISION'),
  /** `DECIMAL(precision, scale)`; values are returned as strings. */
  DECIMAL: callable(decimalType, decimalType()),
  /** Alias of `DECIMAL`. */
  NUMBER: callable(decimalType, decimalType()),
  /** `BOOLEAN`. */
  BOOLEAN: type('BOOLEAN', 'BOOLEAN'),
  /** `TIMESTAMP WITH TIME ZONE`; values are `Date` objects. */
  DATE: callable(dateType, dateType()),
  /** `DATE`; values are `'YYYY-MM-DD'` strings. */
  DATEONLY: type('DATEONLY', 'DATE'),
  /** `TIME`. */
  TIME: type('TIME', 'TIME'),
  /** `JSON`. */
  JSON: type('JSON', 'JSON', { isJson: true, serialize: stringifyJson }),
  /** `JSONB`. */
  JSONB: type('JSONB', 'JSONB', { isJson: true, serialize: stringifyJson }),
  /** `BYTEA`; values are `Buffer`s. */
  BLOB: callable(
    (_size?: 'tiny' | 'medium' | 'long') => type('BLOB', 'BYTEA'),
    type('BLOB', 'BYTEA'),
  ),
  /** `UUID`. */
  UUID: type('UUID', 'UUID'),
  /** `HSTORE` (requires the `hstore` extension). */
  HSTORE: type('HSTORE', 'HSTORE'),
  /** `INET`. */
  INET: type('INET', 'INET'),
  /** `CIDR`. */
  CIDR: type('CIDR', 'CIDR'),
  /** `MACADDR`. */
  MACADDR: type('MACADDR', 'MACADDR'),
  /** `TSVECTOR`. */
  TSVECTOR: type('TSVECTOR', 'TSVECTOR'),
  /** PostGIS `GEOMETRY(type, srid)`. */
  GEOMETRY: callable(
    (geometryType?: string, srid?: number) => spatialType('GEOMETRY', geometryType, srid),
    spatialType('GEOMETRY'),
  ),
  /** PostGIS `GEOGRAPHY(type, srid)`. */
  GEOGRAPHY: callable(
    (geographyType?: string, srid?: number) => spatialType('GEOGRAPHY', geographyType, srid),
    spatialType('GEOGRAPHY'),
  ),
  /** `type[]`, e.g. `DataTypes.ARRAY(DataTypes.TEXT)`. */
  ARRAY: arrayType,
  /** Range type, e.g. `DataTypes.RANGE(DataTypes.INTEGER)` → `INT4RANGE`. */
  RANGE: callable(rangeType, rangeType()),
  /** Enumerated values: `DataTypes.ENUM('a', 'b')` or `DataTypes.ENUM({ values: ['a', 'b'] })`. */
  ENUM: enumType,
  /** Attribute that is not stored in the database (computed by getters/setters). */
  VIRTUAL: callable(virtualType, virtualType()),
  /** Default value: current timestamp. */
  NOW: Object.freeze({ key: 'NOW', generate: () => new Date() }) satisfies DefaultValueGenerator,
  /** Default value: random UUID v4 generated on the client. */
  UUIDV4: Object.freeze({
    key: 'UUIDV4',
    generate: () => randomUUID(),
  }) satisfies DefaultValueGenerator,
} as const;

/** @internal */
export const isDefaultValueGenerator = (value: unknown): value is DefaultValueGenerator =>
  value === DataTypes.NOW || value === DataTypes.UUIDV4;
