import { randomUUID } from 'node:crypto';
import type { DataType, DataTypeInput } from './abstract-data-type.ts';
import { ArrayType } from './array-type.ts';
import { BitType } from './bit-type.ts';
import { BlobType } from './blob-type.ts';
import { CharType } from './char-type.ts';
import { CompositeType } from './composite-type.ts';
import { DateType } from './date-type.ts';
import { DecimalType } from './decimal-type.ts';
import { DefaultValueGenerator } from './default-value-generator.ts';
import { EnumType } from './enum-type.ts';
import { FloatType } from './float-type.ts';
import { GeometricType } from './geometric-type.ts';
import { HstoreType } from './hstore-type.ts';
import { IntegerType, type IntegerArgument } from './integer-type.ts';
import { JsonType } from './json-type.ts';
import { MultirangeType } from './multirange-type.ts';
import { RangeType } from './range-type.ts';
import { ScalarType } from './scalar-type.ts';
import { SpatialType } from './spatial-type.ts';
import { StringType } from './string-type.ts';
import { TextType } from './text-type.ts';
import { TimestampType } from './timestamp-type.ts';
import { VirtualType } from './virtual-type.ts';

export type { DataType, DataTypeInput } from './abstract-data-type.ts';
export type { GeoCircle, GeoLine, GeoPath } from './geometric-type.ts';
export type { GeoPoint } from './geometric-text.ts';
export type { CompositeValue } from './composite-type.ts';
export type { HstoreValue } from './hstore-type.ts';
export type { IntegerDataType } from './integer-type.ts';
export type { RangeBound } from './range-type.ts';
export type { DefaultValueGenerator } from './default-value-generator.ts';

/** A type usable bare, called and constructed, like v6: `DataTypes.STRING`, `DataTypes.STRING(64)`, `new DataTypes.STRING(64)`. */
type Callable<T, A extends unknown[], R = T> = ((...args: A) => R) & (new (...args: A) => R) & T;

/** Integer types and their `UNSIGNED` / `ZEROFILL` chains: `DataTypes.INTEGER.UNSIGNED.ZEROFILL(11)`. */
type CallableInteger<R extends DataTypes.IntegerFamilyDataType> = Callable<
  IntegerType,
  [argument?: IntegerArgument],
  R
> &
  Readonly<{ UNSIGNED: CallableInteger<R>; ZEROFILL: CallableInteger<R> }>;

/** Makes a type usable both bare and called, like `DataTypes.STRING` and `DataTypes.STRING(64)`. */
const callable = <A extends unknown[], T extends DataType>(
  build: (...args: A) => T,
  bare: T,
  extra: PropertyDescriptorMap = {},
): Callable<T, A> => {
  // A function expression, so that `new DataTypes.X(...)` works as in v6 (it returns the built type).
  const fn = function (...args: A): T {
    return build(...args);
  };
  Object.assign(fn, bare);
  if ('toSql' in bare) {
    Object.defineProperty(fn, 'toSql', { value: () => bare.sqlType });
  }
  Object.defineProperties(fn, extra);
  return Object.freeze(fn) as unknown as Callable<T, A>;
};

/** A type that takes no arguments but is callable like in v6 (`DataTypes.UUID()`). */
const plain = <T extends DataType>(bare: T): Callable<T, [], DataTypes.AbstractDataType> =>
  callable(() => bare, bare) as unknown as Callable<T, [], DataTypes.AbstractDataType>;

const wrapInteger = <R extends DataTypes.IntegerFamilyDataType>(
  bare: IntegerType,
): CallableInteger<R> =>
  callable((argument?: IntegerArgument) => bare.configured(argument), bare, {
    UNSIGNED: { get: () => wrapInteger<R>(bare.UNSIGNED) },
    ZEROFILL: { get: () => wrapInteger<R>(bare.ZEROFILL) },
  }) as unknown as CallableInteger<R>;

const integer = <R extends DataTypes.IntegerFamilyDataType>(
  key: string,
  sqlType: string,
): CallableInteger<R> => wrapInteger<R>(new IntegerType(key, sqlType));

/** `REAL` / `DOUBLE` called with the arguments v6 takes (length, decimals); PostgreSQL ignores them. */
const floating = <R extends DataTypes.NumberDataType>(
  key: string,
  sqlType: string,
): Callable<ScalarType, [length?: number, decimals?: number], R> =>
  callable(
    (length?: number, decimals?: number) =>
      new ScalarType(key, sqlType, {
        ...(length === undefined ? {} : { length }),
        ...(decimals === undefined ? {} : { decimals }),
      }),
    new ScalarType(key, sqlType),
  ) as unknown as Callable<ScalarType, [length?: number, decimals?: number], R>;

const INTEGER = new IntegerType('INTEGER', 'INTEGER');

/** Element type as the v6 generic interfaces take it (a raw type name stays an untyped element). */
type Element<T> = T extends DataTypes.AbstractDataType | DataTypes.AbstractDataTypeConstructor
  ? T
  : DataTypes.AbstractDataType;

/** `DataTypes.RANGE`: bare, or called with the element type. */
type RangeFactory = RangeType &
  (<T extends DataTypeInput = typeof INTEGER>(
    subtype?: T,
  ) => RangeType & DataTypes.RangeDataType<Element<T>>);

/** `DataTypes.VIRTUAL`: bare, or called with the type of the computed value and its attributes. */
type VirtualFactory = VirtualType &
  (<T extends DataTypeInput = DataTypes.AbstractDataType>(
    returnType?: T,
    fields?: readonly string[],
  ) => VirtualType & DataTypes.VirtualDataType<Element<T>>);

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
  STRING: callable((length?: number) => new StringType(length), new StringType()),
  /** `CHAR(length)`, default length 255. */
  CHAR: callable((length?: number) => new CharType(length), new CharType()),
  /** `TEXT`. The size argument is accepted for compatibility and ignored. */
  TEXT: callable((size?: 'tiny' | 'medium' | 'long') => new TextType(size), new TextType()),
  /** `CITEXT` (case-insensitive text, requires the `citext` extension). */
  CITEXT: plain(new ScalarType('CITEXT', 'CITEXT')),
  /** `INTEGER`. */
  INTEGER: integer<DataTypes.IntegerDataType>('INTEGER', 'INTEGER'),
  /** `SMALLINT`. */
  SMALLINT: integer<DataTypes.SmallIntegerDataType>('SMALLINT', 'SMALLINT'),
  /** Mapped to `SMALLINT` (PostgreSQL has no `TINYINT`). */
  TINYINT: integer<DataTypes.TinyIntegerDataType>('TINYINT', 'SMALLINT'),
  /** Mapped to `INTEGER` (PostgreSQL has no `MEDIUMINT`). */
  MEDIUMINT: integer<DataTypes.MediumIntegerDataType>('MEDIUMINT', 'INTEGER'),
  /** `BIGINT`; values are returned as strings. */
  BIGINT: integer<DataTypes.BigIntDataType>('BIGINT', 'BIGINT'),
  /** `FLOAT(precision)`. */
  FLOAT: callable((digits?: number) => new FloatType(digits), new FloatType()),
  /** `REAL`. */
  REAL: floating<DataTypes.RealDataType>('REAL', 'REAL'),
  /** `DOUBLE PRECISION`. */
  DOUBLE: floating<DataTypes.DoubleDataType>('DOUBLE', 'DOUBLE PRECISION'),
  /** `DECIMAL(precision, scale)`; values are returned as strings. */
  DECIMAL: callable(
    (digits?: number, scale?: number) => new DecimalType(digits, scale),
    new DecimalType(),
  ),
  /** Alias of `DECIMAL`. */
  NUMBER: callable(
    (digits?: number, scale?: number) => new DecimalType(digits, scale),
    new DecimalType(),
  ),
  /** Alias of `DECIMAL` (v6 `NUMERIC`). */
  NUMERIC: callable(
    (digits?: number, scale?: number) => new DecimalType(digits, scale),
    new DecimalType(),
  ),
  /** `DOUBLE PRECISION` (v6 alias of `DOUBLE`). */
  'DOUBLE PRECISION': floating<DataTypes.DoubleDataType>('DOUBLE', 'DOUBLE PRECISION'),
  /** `BOOLEAN`. */
  BOOLEAN: plain(new ScalarType('BOOLEAN', 'BOOLEAN')),
  /** `TIMESTAMP WITH TIME ZONE`; values are `Date` objects. */
  DATE: callable((fsp?: number) => new DateType(fsp), new DateType()),
  /**
   * `TIMESTAMP WITHOUT TIME ZONE`; values are `Date` objects whose local wall-clock time is the
   * stored time. PostgreSQL extension.
   */
  TIMESTAMP: callable((fsp?: number) => new TimestampType(fsp), new TimestampType()),
  /** `DATE`; values are `'YYYY-MM-DD'` strings. */
  DATEONLY: plain(new ScalarType('DATEONLY', 'DATE')),
  /** `TIME`. */
  TIME: plain(new ScalarType('TIME', 'TIME')),
  /** `INTERVAL`; values are PostgreSQL interval strings (e.g. `'1 day 02:00:00'`). PostgreSQL extension. */
  INTERVAL: new ScalarType('INTERVAL', 'INTERVAL'),
  /** `JSON`. */
  JSON: plain(new JsonType('JSON')),
  /** `JSONB`. */
  JSONB: plain(new JsonType('JSONB')),
  /** `BYTEA`; values are `Buffer`s. */
  BLOB: callable((size?: 'tiny' | 'medium' | 'long') => new BlobType(size), new BlobType()),
  /** `UUID`. */
  UUID: plain(new ScalarType('UUID', 'UUID')),
  /**
   * `HSTORE` (requires the `hstore` extension); values are objects of string (or `null`) values,
   * like Sequelize v6.
   */
  HSTORE: plain(new HstoreType()),
  /**
   * `LTREE` label path (requires the `ltree` extension); values are strings like `'Top.Science'`.
   * PostgreSQL extension.
   */
  LTREE: new ScalarType('LTREE', 'LTREE'),
  /**
   * `MONEY`; values are strings formatted by the server's `lc_monetary` (e.g. `'$12.50'`); numbers
   * are accepted on write. PostgreSQL extension.
   */
  MONEY: new ScalarType('MONEY', 'MONEY'),
  /** `XML`; values are XML text. PostgreSQL extension. */
  XML: new ScalarType('XML', 'XML'),
  /** `BIT(length)`, default length 1; values are strings of `0` and `1`. PostgreSQL extension. */
  BIT: callable((length?: number) => new BitType('BIT', length), new BitType('BIT')),
  /**
   * `BIT VARYING(length)`, unlimited without a length; values are strings of `0` and `1`.
   * PostgreSQL extension.
   */
  VARBIT: callable((length?: number) => new BitType('VARBIT', length), new BitType('VARBIT')),
  /** `INET`. */
  INET: plain(new ScalarType('INET', 'INET')),
  /** `CIDR`. */
  CIDR: plain(new ScalarType('CIDR', 'CIDR')),
  /** `MACADDR`. */
  MACADDR: plain(new ScalarType('MACADDR', 'MACADDR')),
  /** `MACADDR8` (EUI-64 address). PostgreSQL extension. */
  MACADDR8: new ScalarType('MACADDR8', 'MACADDR8'),
  /** `TSQUERY`; values are full-text query strings. PostgreSQL extension. */
  TSQUERY: new ScalarType('TSQUERY', 'TSQUERY'),
  /** `TSVECTOR`. */
  TSVECTOR: plain(new ScalarType('TSVECTOR', 'TSVECTOR')),
  /** `POINT`; values are `{ x, y }`. PostgreSQL extension. */
  POINT: new GeometricType('POINT'),
  /** `LINE` (`a·x + b·y + c = 0`); values are `{ a, b, c }`. PostgreSQL extension. */
  LINE: new GeometricType('LINE'),
  /** `LSEG` line segment; values are `[start, end]` points. PostgreSQL extension. */
  LSEG: new GeometricType('LSEG'),
  /** `BOX`; values are `[corner, corner]` points (the server returns the upper right first). PostgreSQL extension. */
  BOX: new GeometricType('BOX'),
  /** `PATH`; values are `{ points, closed }`. PostgreSQL extension. */
  PATH: new GeometricType('PATH'),
  /** `POLYGON`; values are arrays of `{ x, y }` points. PostgreSQL extension. */
  POLYGON: new GeometricType('POLYGON'),
  /** `CIRCLE`; values are `{ x, y, radius }`. PostgreSQL extension. */
  CIRCLE: new GeometricType('CIRCLE'),
  /** PostGIS `GEOMETRY(type, srid)`. */
  GEOMETRY: callable(
    (geometryType?: string, srid?: number) => new SpatialType('GEOMETRY', geometryType, srid),
    new SpatialType('GEOMETRY'),
  ),
  /** PostGIS `GEOGRAPHY(type, srid)`. */
  GEOGRAPHY: callable(
    (geographyType?: string, srid?: number) => new SpatialType('GEOGRAPHY', geographyType, srid),
    new SpatialType('GEOGRAPHY'),
  ),
  /** `type[]`, e.g. `DataTypes.ARRAY(DataTypes.TEXT)`. */
  ARRAY: <T extends DataTypeInput>(subtype: T): ArrayType & DataTypes.ArrayDataType<Element<T>> =>
    new ArrayType(subtype) as ArrayType & DataTypes.ArrayDataType<Element<T>>,
  /** Range type, e.g. `DataTypes.RANGE(DataTypes.INTEGER)` → `INT4RANGE`. */
  RANGE: callable(
    (subtype: DataTypeInput = INTEGER) => new RangeType(subtype),
    new RangeType(INTEGER),
  ) as unknown as RangeFactory,
  /**
   * Multirange type (PostgreSQL 14+), e.g. `DataTypes.MULTIRANGE(DataTypes.INTEGER)` →
   * `INT4MULTIRANGE`; values are arrays of `[lower, upper]` ranges. PostgreSQL extension.
   */
  MULTIRANGE: callable(
    (subtype: DataTypeInput = INTEGER) => new MultirangeType(subtype),
    new MultirangeType(INTEGER),
  ),
  /**
   * Composite type, e.g. `DataTypes.COMPOSITE('address', { street: DataTypes.TEXT, zip: DataTypes.INTEGER })`;
   * values are objects keyed by field name. Create the type first with `createSql()`. PostgreSQL extension.
   */
  COMPOSITE: (name: string, fields: Readonly<Record<string, DataTypeInput>>): CompositeType =>
    new CompositeType(name, fields),
  /** Enumerated values: `DataTypes.ENUM('a', 'b')` or `DataTypes.ENUM({ values: ['a', 'b'] })`. */
  ENUM: <T extends string = string>(
    ...args: readonly (T | readonly T[] | Readonly<{ values: readonly T[] }>)[]
  ): EnumType & DataTypes.EnumDataType<T> =>
    new EnumType(...args) as EnumType & DataTypes.EnumDataType<T>,
  /** Attribute that is not stored in the database (computed by getters/setters). */
  VIRTUAL: callable(
    (returnType?: DataTypeInput, fields?: readonly string[]) => new VirtualType(returnType, fields),
    new VirtualType(),
  ) as unknown as VirtualFactory,
  /** Default value: current timestamp. */
  NOW: new DefaultValueGenerator('NOW', () => new Date()),
  /** Default value: random UUID v4 generated on the client. */
  UUIDV4: new DefaultValueGenerator('UUIDV4', () => randomUUID()),
} as const;

/**
 * The `DataTypes.<X>DataType` interfaces of Sequelize v6: the types of the values `DataTypes.<X>`
 * and `DataTypes.<X>(...)` evaluate to, usable as `DataTypes.DecimalDataType` in annotations.
 *
 * Only the members postgrelize provides at runtime are declared: `key`, `sqlType`, `toSql()` and the
 * `options` the type was created with (and `UNSIGNED` / `ZEROFILL` on the integer types).
 * v6's `dialectTypes`, `stringify`, `validate`, `BINARY` and `escape` are not available.
 *
 * @example
 * ```ts
 * const scale = (type: DataTypes.DecimalDataType): number | undefined => type.options.scale;
 * const price: DataTypes.DecimalDataType = DataTypes.DECIMAL(10, 2);
 * ```
 */
// oxlint-disable-next-line typescript/no-namespace -- merges the v6 type names onto the `DataTypes` value
export namespace DataTypes {
  /** A data type: its `key`, PostgreSQL column type and `toSql()` (v6 `AbstractDataType`). */
  export interface AbstractDataType {
    /** Sequelize v6 type key, e.g. `'DECIMAL'`. */
    readonly key: string;
    /** PostgreSQL column type, e.g. `'DECIMAL(10,2)'`. */
    readonly sqlType: string;
    /** The PostgreSQL column type. */
    toSql(): string;
  }
  /** A data type or a function that creates one (`DataTypes.STRING` / `DataTypes.STRING(64)`). */
  export type AbstractDataTypeConstructor = (...args: never[]) => AbstractDataType;
  /** `VARCHAR` options. */
  export interface StringDataTypeOptions {
    /** Maximum length. */
    length?: number;
    /** Binary collation (not applied by PostgreSQL). */
    binary?: boolean;
  }
  /** Type of `DataTypes.STRING`. */
  export interface StringDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: StringDataTypeOptions;
  }
  /** `CHAR` options. */
  export interface CharDataTypeOptions extends StringDataTypeOptions {}
  /** Type of `DataTypes.CHAR`. */
  export interface CharDataType extends StringDataType {
    /** Arguments the type was created with. */
    readonly options: CharDataTypeOptions;
  }
  /** Size names accepted by `TEXT` and `BLOB`. */
  export type TextLength = 'tiny' | 'medium' | 'long';
  /** `TEXT` options. */
  export interface TextDataTypeOptions {
    /** Size name (ignored by PostgreSQL). */
    length?: TextLength;
  }
  /** Type of `DataTypes.TEXT`. */
  export interface TextDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: TextDataTypeOptions;
  }
  /** Options of the integer types. */
  export interface IntegerDataTypeOptions {
    /** Display width. */
    length?: number;
    /** `ZEROFILL`. */
    zerofill?: boolean;
    /** `UNSIGNED`. */
    unsigned?: boolean;
  }
  /** Options of the numeric types. */
  export interface NumberDataTypeOptions extends IntegerDataTypeOptions {
    /** Digits after the decimal point. */
    decimals?: number;
    /** Total digits. */
    precision?: number;
    /** Digits after the decimal point of a `DECIMAL`. */
    scale?: number;
  }
  /** Type of `DataTypes.NUMBER` and base of the numeric types. */
  export interface NumberDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: NumberDataTypeOptions;
  }
  /** Base of the integer types: they accept `UNSIGNED` and `ZEROFILL`. */
  export interface IntegerFamilyDataType extends NumberDataType {
    /** Accepted for compatibility; has no effect in PostgreSQL. */
    readonly UNSIGNED: this;
    /** Accepted for compatibility; has no effect in PostgreSQL. */
    readonly ZEROFILL: this;
  }
  /** Type of `DataTypes.TINYINT`. */
  export interface TinyIntegerDataType extends IntegerFamilyDataType {
    /** Arguments the type was created with. */
    readonly options: IntegerDataTypeOptions;
  }
  /** Type of `DataTypes.SMALLINT`. */
  export interface SmallIntegerDataType extends IntegerFamilyDataType {
    /** Arguments the type was created with. */
    readonly options: IntegerDataTypeOptions;
  }
  /** Type of `DataTypes.MEDIUMINT`. */
  export interface MediumIntegerDataType extends IntegerFamilyDataType {
    /** Arguments the type was created with. */
    readonly options: IntegerDataTypeOptions;
  }
  /** Type of `DataTypes.INTEGER`. */
  export interface IntegerDataType extends IntegerFamilyDataType {
    /** Arguments the type was created with. */
    readonly options: NumberDataTypeOptions;
  }
  /** Type of `DataTypes.BIGINT`. */
  export interface BigIntDataType extends IntegerFamilyDataType {
    /** Arguments the type was created with. */
    readonly options: IntegerDataTypeOptions;
  }
  /** `FLOAT` options. */
  export interface FloatDataTypeOptions {
    /** Precision in bits. */
    length?: number;
    /** Digits after the decimal point. */
    decimals?: number;
  }
  /** Type of `DataTypes.FLOAT`. */
  export interface FloatDataType extends NumberDataType {
    /** Arguments the type was created with. */
    readonly options: FloatDataTypeOptions;
  }
  /** `REAL` options. */
  export interface RealDataTypeOptions extends FloatDataTypeOptions {}
  /** Type of `DataTypes.REAL`. */
  export interface RealDataType extends NumberDataType {
    /** Arguments the type was created with. */
    readonly options: RealDataTypeOptions;
  }
  /** `DOUBLE PRECISION` options. */
  export interface DoubleDataTypeOptions extends FloatDataTypeOptions {}
  /** Type of `DataTypes.DOUBLE`. */
  export interface DoubleDataType extends NumberDataType {
    /** Arguments the type was created with. */
    readonly options: DoubleDataTypeOptions;
  }
  /** `DECIMAL` options. */
  export interface DecimalDataTypeOptions {
    /** Total digits. */
    precision?: number;
    /** Digits after the decimal point. */
    scale?: number;
  }
  /** Type of `DataTypes.DECIMAL` (and `NUMBER` / `NUMERIC` called with arguments). */
  export interface DecimalDataType extends NumberDataType {
    /** Arguments the type was created with. */
    readonly options: DecimalDataTypeOptions;
  }
  /** `TIMESTAMP WITH TIME ZONE` options. */
  export interface DateDataTypeOptions {
    /** Fractional seconds precision. */
    length?: string | number;
  }
  /** Type of `DataTypes.DATE`. */
  export interface DateDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: DateDataTypeOptions;
  }
  /** Type of `DataTypes.DATEONLY`. */
  export interface DateOnlyDataType extends AbstractDataType {}
  /** `BYTEA` options. */
  export interface BlobDataTypeOptions {
    /** Size name (ignored by PostgreSQL). */
    length?: TextLength;
    /** Escape the value as a literal. */
    escape?: boolean;
  }
  /** Type of `DataTypes.BLOB`. */
  export interface BlobDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: BlobDataTypeOptions;
  }
  /** Element types a range accepts. */
  export type RangeableDataType = AbstractDataType | AbstractDataTypeConstructor;
  /** Range options. */
  export interface RangeDataTypeOptions<T extends RangeableDataType> {
    /** Element type. */
    subtype?: T;
  }
  /** Type of `DataTypes.RANGE(subtype)`. */
  export interface RangeDataType<
    T extends RangeableDataType = AbstractDataType,
  > extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: RangeDataTypeOptions<T>;
  }
  /** Type of `DataTypes.VIRTUAL(returnType, fields)`. */
  export interface VirtualDataType<
    T extends AbstractDataType | AbstractDataTypeConstructor = AbstractDataType,
  > extends AbstractDataType {
    /** Type of the computed value. */
    readonly returnType: T | undefined;
    /** Attributes the value is computed from. */
    readonly fields: readonly string[];
  }
  /** `ENUM` options. */
  export interface EnumDataTypeOptions<T extends string> {
    /** Allowed values. */
    values: readonly T[];
  }
  /** Type of `DataTypes.ENUM(...values)`. */
  export interface EnumDataType<T extends string = string> extends AbstractDataType {
    /** Allowed values. */
    readonly values: readonly T[];
    /** Arguments the type was created with. */
    readonly options: EnumDataTypeOptions<T>;
  }
  /** Array options. */
  export interface ArrayDataTypeOptions<T extends AbstractDataType | AbstractDataTypeConstructor> {
    /** Element type. */
    type: T;
  }
  /** Type of `DataTypes.ARRAY(type)`. */
  export interface ArrayDataType<
    T extends AbstractDataType | AbstractDataTypeConstructor = AbstractDataType,
  > extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: ArrayDataTypeOptions<T>;
  }
  /** PostGIS `GEOMETRY` options. */
  export interface GeometryDataTypeOptions {
    /** Shape, e.g. `'POINT'`. */
    type?: string;
    /** Spatial reference id. */
    srid?: number;
  }
  /** Type of `DataTypes.GEOMETRY`. */
  export interface GeometryDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: GeometryDataTypeOptions;
  }
  /** PostGIS `GEOGRAPHY` options. */
  export interface GeographyDataTypeOptions extends GeometryDataTypeOptions {}
  /** Type of `DataTypes.GEOGRAPHY`. */
  export interface GeographyDataType extends AbstractDataType {
    /** Arguments the type was created with. */
    readonly options: GeographyDataTypeOptions;
  }
}
