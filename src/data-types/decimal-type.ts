import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `DECIMAL(precision, scale)` (`DataTypes.DECIMAL`, `DataTypes.NUMBER`); values are strings.
 *
 * @internal
 */
export class DecimalType extends AbstractDataType {
  /**
   * @param digits - Precision.
   * @param scale - Scale.
   */
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
    Object.freeze(this);
  }
}
