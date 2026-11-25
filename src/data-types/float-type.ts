import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `FLOAT(precision)` (`DataTypes.FLOAT`).
 *
 * @internal
 */
export class FloatType extends AbstractDataType {
  /**
   * @param digits - Precision.
   */
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: number; decimals?: number }>;

  constructor(digits?: number) {
    super(
      'FLOAT',
      digits === undefined
        ? 'FLOAT'
        : `FLOAT(${AbstractDataType.integer('FLOAT precision', digits)})`,
    );
    this.options = Object.freeze(digits === undefined ? {} : { length: digits });
    Object.freeze(this);
  }
}
