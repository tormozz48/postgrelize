import { AbstractDataType, type DataType } from './abstract-data-type.ts';

/** Integer type with Sequelize v6 MySQL-only modifiers kept as no-ops for compatibility. */
export type IntegerDataType = DataType &
  Readonly<{
    /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
    UNSIGNED: IntegerDataType;
    /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
    ZEROFILL: IntegerDataType;
  }>;

/** What the integer types take when called, like v6: a display width or an options object. */
export type IntegerArgument =
  | number
  | Readonly<{ length?: number; zerofill?: boolean; unsigned?: boolean }>;

/**
 * Integer types (`INTEGER`, `BIGINT`, `SMALLINT`, ...).
 *
 * @internal
 */
export class IntegerType extends AbstractDataType implements IntegerDataType {
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{
    length?: number;
    zerofill?: boolean;
    unsigned?: boolean;
    decimals?: number;
    precision?: number;
    scale?: number;
  }>;

  /**
   * @param key - Sequelize v6 type key.
   * @param sqlType - PostgreSQL column type.
   * @param options - Display width and `UNSIGNED` / `ZEROFILL` flags.
   */
  constructor(
    key: string,
    sqlType: string,
    options: Readonly<{ length?: number; zerofill?: boolean; unsigned?: boolean }> = {},
  ) {
    super(key, sqlType);
    this.options = Object.freeze({ ...options });
    Object.freeze(this);
  }

  /**
   * The same type created with arguments, like `DataTypes.INTEGER(11)`; PostgreSQL ignores them.
   *
   * @param argument - Display width or options.
   * @returns A new type.
   */
  configured(argument?: IntegerArgument): IntegerType {
    const given = typeof argument === 'number' ? { length: argument } : (argument ?? {});
    return new IntegerType(this.key, this.sqlType, { ...this.options, ...given });
  }

  /** `UNSIGNED` flag: recorded in `options`, no effect in PostgreSQL (kept for Sequelize v6 compatibility). */
  get UNSIGNED(): IntegerType {
    return this.configured({ unsigned: true });
  }

  /** `ZEROFILL` flag: recorded in `options`, no effect in PostgreSQL (kept for Sequelize v6 compatibility). */
  get ZEROFILL(): IntegerType {
    return this.configured({ zerofill: true });
  }
}
