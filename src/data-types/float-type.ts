import { AbstractDataType } from './abstract-data-type.ts';
import { NumberType } from './number-type.ts';

/**
 * `FLOAT(precision)` (`DataTypes.FLOAT`).
 *
 * @internal
 */
export class FloatType extends NumberType {
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: number; decimals?: number }>;

  /**
   * @param digits - Precision; dropped when `decimals` is given, like Sequelize v6 on PostgreSQL.
   * @param decimals - Digits after the decimal point.
   */
  constructor(digits?: number, decimals?: number) {
    super(
      'FLOAT',
      digits === undefined || decimals !== undefined
        ? 'FLOAT'
        : `FLOAT(${AbstractDataType.integer('FLOAT precision', digits)})`,
    );
    this.options = Object.freeze({
      ...(digits === undefined ? {} : { length: digits }),
      ...(decimals === undefined ? {} : { decimals }),
    });
    Object.freeze(this);
  }
}
