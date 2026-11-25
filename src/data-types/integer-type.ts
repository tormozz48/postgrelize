import { AbstractDataType, type DataType } from './abstract-data-type.ts';

/** Integer type with Sequelize v6 MySQL-only modifiers kept as no-ops for compatibility. */
export type IntegerDataType = DataType &
  Readonly<{
    /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
    UNSIGNED: IntegerDataType;
    /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
    ZEROFILL: IntegerDataType;
  }>;

/**
 * Integer types (`INTEGER`, `BIGINT`, `SMALLINT`, ...).
 *
 * @internal
 */
export class IntegerType extends AbstractDataType implements IntegerDataType {
  /**
   * @param key - Sequelize v6 type key.
   * @param sqlType - PostgreSQL column type.
   */
  /** Arguments the type was created with (v6 `options`); integer types take none. */
  readonly options: Readonly<{
    length?: number;
    zerofill?: boolean;
    unsigned?: boolean;
    decimals?: number;
    precision?: number;
    scale?: number;
  }> = Object.freeze({});

  constructor(key: string, sqlType: string) {
    super(key, sqlType);
    Object.freeze(this);
  }

  /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
  get UNSIGNED(): this {
    return this;
  }

  /** No-op in PostgreSQL, kept for Sequelize v6 compatibility. */
  get ZEROFILL(): this {
    return this;
  }
}
