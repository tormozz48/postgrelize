import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `TIMESTAMP WITH TIME ZONE` (`DataTypes.DATE`); values are `Date` objects.
 *
 * @internal
 */
export class DateType extends AbstractDataType {
  /** Converts a driver string into a `Date`. */
  readonly parse = (value: unknown): unknown =>
    typeof value === 'string' ? new Date(value) : value;

  /**
   * @param fsp - Fractional seconds precision.
   */
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: string | number }>;

  constructor(fsp?: number) {
    super(
      'DATE',
      fsp === undefined
        ? 'TIMESTAMP WITH TIME ZONE'
        : `TIMESTAMP(${AbstractDataType.integer('DATE precision', fsp)}) WITH TIME ZONE`,
    );
    this.options = Object.freeze(fsp === undefined ? {} : { length: fsp });
    Object.freeze(this);
  }
}
