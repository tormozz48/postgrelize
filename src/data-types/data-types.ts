import { randomUUID } from 'node:crypto';
import type { DataType, DataTypeInput } from './abstract-data-type.ts';
import { ArrayType } from './array-type.ts';
import { BlobType } from './blob-type.ts';
import { CharType } from './char-type.ts';
import { DateType } from './date-type.ts';
import { DecimalType } from './decimal-type.ts';
import { DefaultValueGenerator } from './default-value-generator.ts';
import { EnumType } from './enum-type.ts';
import { FloatType } from './float-type.ts';
import { IntegerType } from './integer-type.ts';
import { JsonType } from './json-type.ts';
import { RangeType } from './range-type.ts';
import { ScalarType } from './scalar-type.ts';
import { SpatialType } from './spatial-type.ts';
import { StringType } from './string-type.ts';
import { TextType } from './text-type.ts';
import { VirtualType } from './virtual-type.ts';

export type { DataType, DataTypeInput } from './abstract-data-type.ts';
export type { IntegerDataType } from './integer-type.ts';
export type { RangeBound } from './range-type.ts';
export type { DefaultValueGenerator } from './default-value-generator.ts';

/** Makes a type usable both bare and called, like `DataTypes.STRING` and `DataTypes.STRING(64)`. */
const callable = <A extends unknown[], T extends DataType>(
  build: (...args: A) => T,
  bare: T,
): ((...args: A) => T) & T => Object.freeze(Object.assign((...args: A) => build(...args), bare));

const INTEGER = new IntegerType('INTEGER', 'INTEGER');

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
  CITEXT: new ScalarType('CITEXT', 'CITEXT'),
  /** `INTEGER`. */
  INTEGER,
  /** `SMALLINT`. */
  SMALLINT: new IntegerType('SMALLINT', 'SMALLINT'),
  /** Mapped to `SMALLINT` (PostgreSQL has no `TINYINT`). */
  TINYINT: new IntegerType('TINYINT', 'SMALLINT'),
  /** Mapped to `INTEGER` (PostgreSQL has no `MEDIUMINT`). */
  MEDIUMINT: new IntegerType('MEDIUMINT', 'INTEGER'),
  /** `BIGINT`; values are returned as strings. */
  BIGINT: new IntegerType('BIGINT', 'BIGINT'),
  /** `FLOAT(precision)`. */
  FLOAT: callable((digits?: number) => new FloatType(digits), new FloatType()),
  /** `REAL`. */
  REAL: new ScalarType('REAL', 'REAL'),
  /** `DOUBLE PRECISION`. */
  DOUBLE: new ScalarType('DOUBLE', 'DOUBLE PRECISION'),
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
  /** `BOOLEAN`. */
  BOOLEAN: new ScalarType('BOOLEAN', 'BOOLEAN'),
  /** `TIMESTAMP WITH TIME ZONE`; values are `Date` objects. */
  DATE: callable((fsp?: number) => new DateType(fsp), new DateType()),
  /** `DATE`; values are `'YYYY-MM-DD'` strings. */
  DATEONLY: new ScalarType('DATEONLY', 'DATE'),
  /** `TIME`. */
  TIME: new ScalarType('TIME', 'TIME'),
  /** `INTERVAL`; values are PostgreSQL interval strings (e.g. `'1 day 02:00:00'`). PostgreSQL extension. */
  INTERVAL: new ScalarType('INTERVAL', 'INTERVAL'),
  /** `JSON`. */
  JSON: new JsonType('JSON'),
  /** `JSONB`. */
  JSONB: new JsonType('JSONB'),
  /** `BYTEA`; values are `Buffer`s. */
  BLOB: callable((size?: 'tiny' | 'medium' | 'long') => new BlobType(size), new BlobType()),
  /** `UUID`. */
  UUID: new ScalarType('UUID', 'UUID'),
  /** `HSTORE` (requires the `hstore` extension). */
  HSTORE: new ScalarType('HSTORE', 'HSTORE'),
  /** `INET`. */
  INET: new ScalarType('INET', 'INET'),
  /** `CIDR`. */
  CIDR: new ScalarType('CIDR', 'CIDR'),
  /** `MACADDR`. */
  MACADDR: new ScalarType('MACADDR', 'MACADDR'),
  /** `TSVECTOR`. */
  TSVECTOR: new ScalarType('TSVECTOR', 'TSVECTOR'),
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
  ARRAY: (subtype: DataTypeInput): ArrayType => new ArrayType(subtype),
  /** Range type, e.g. `DataTypes.RANGE(DataTypes.INTEGER)` → `INT4RANGE`. */
  RANGE: callable(
    (subtype: DataTypeInput = INTEGER) => new RangeType(subtype),
    new RangeType(INTEGER),
  ),
  /** Enumerated values: `DataTypes.ENUM('a', 'b')` or `DataTypes.ENUM({ values: ['a', 'b'] })`. */
  ENUM: (
    ...args: readonly (string | readonly string[] | Readonly<{ values: readonly string[] }>)[]
  ): EnumType => new EnumType(...args),
  /** Attribute that is not stored in the database (computed by getters/setters). */
  VIRTUAL: callable(
    (returnType?: DataTypeInput, fields?: readonly string[]) => new VirtualType(returnType, fields),
    new VirtualType(),
  ),
  /** Default value: current timestamp. */
  NOW: new DefaultValueGenerator('NOW', () => new Date()),
  /** Default value: random UUID v4 generated on the client. */
  UUIDV4: new DefaultValueGenerator('UUIDV4', () => randomUUID()),
} as const;
