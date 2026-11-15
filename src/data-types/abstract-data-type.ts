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
   * Resolves a data type given bare or called (`DataTypes.STRING` / `DataTypes.STRING(64)`).
   *
   * @param input - Data type or callable data type.
   * @returns The data type; a callable type carries the properties of its default form.
   */
  static from(input: DataTypeInput): DataType {
    return typeof input === 'function' ? (input as unknown as DataType) : input;
  }
}
