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
  constructor(digits?: number) {
    super(
      'FLOAT',
      digits === undefined
        ? 'FLOAT'
        : `FLOAT(${AbstractDataType.integer('FLOAT precision', digits)})`,
    );
    Object.freeze(this);
  }
}
