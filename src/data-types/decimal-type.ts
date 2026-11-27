import { AbstractDataType } from './abstract-data-type.ts';
import { NumberType } from './number-type.ts';

/**
 * `DECIMAL(precision, scale)` (`DataTypes.DECIMAL`, `DataTypes.NUMBER`); values are strings.
 *
 * @internal
 */
export class DecimalType extends NumberType {
  /**
   * @param digits - Precision.
   * @param scale - Scale.
   */
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ precision?: number; scale?: number }>;

  constructor(digits?: number, scale?: number) {
    super(
      'DECIMAL',
      digits === undefined
        ? 'DECIMAL'
        : `DECIMAL(${[digits, scale]
            .filter((n) => n !== undefined)
            .map((n) => AbstractDataType.integer('DECIMAL precision and scale', n))
            .join(',')})`,
    );
    this.options = Object.freeze({
      ...(digits === undefined ? {} : { precision: digits }),
      ...(scale === undefined ? {} : { scale }),
    });
    Object.freeze(this);
  }
}
