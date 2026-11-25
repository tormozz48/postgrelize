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
  /** SQL type that `where` parameters of this type are cast to (types PostgreSQL cannot infer from an untyped parameter). */
  bindCast?: string;
  /** Converts a value read from the driver into the attribute value. */
  parse?: (value: unknown) => unknown;
  /** Converts an attribute value into a driver parameter. */
  serialize?: (value: unknown) => unknown;
}>;

/** A data type used as is (`DataTypes.INTEGER`) or after calling it (`DataTypes.STRING(64)`), or a raw PostgreSQL type name (`'vector(384)'`) like in Sequelize v6. */
export type DataTypeInput = string | DataType | ((...args: never[]) => DataType);

/**
 * Base of the built-in data type classes. Conversions (`parse`, `serialize`) are own function
 * properties, present only on types that convert values, so they can be read and called detached.
 *
 * @internal
 */
export abstract class AbstractDataType implements DataType {
  /** Sequelize v6 type key, e.g. `'STRING'`. */
  readonly key: string;
  /** PostgreSQL column type, e.g. `'VARCHAR(255)'`. */
  readonly sqlType: string;

  /**
   * @param key - Sequelize v6 type key.
   * @param sqlType - PostgreSQL column type.
   */
  constructor(key: string, sqlType: string) {
    this.key = key;
    this.sqlType = sqlType;
  }

  /**
   * PostgreSQL column type, like Sequelize v6 `toSql()`.
   *
   * @returns The SQL type, e.g. `'VARCHAR(255)'`.
   */
  toSql(): string {
    return this.sqlType;
  }

  /**
   * Validates a numeric type parameter (length, precision, scale, srid) before it reaches SQL.
   *
   * @param name - Parameter name for the error message.
   * @param value - Parameter value.
   * @returns The value.
   */
  protected static integer(name: string, value: number): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer, got ${String(value)}`);
    }
    return value;
  }

  /**
   * Resolves a data type given bare or called (`DataTypes.STRING` / `DataTypes.STRING(64)`).
   *
   * @param input - Data type or callable data type.
   * @returns The data type; a callable type carries the properties of its default form.
   */
  static from(input: DataTypeInput): DataType {
    if (typeof input === 'string') {
      return { key: input, sqlType: input };
    }
    return typeof input === 'function' ? (input as unknown as DataType) : input;
  }
}
