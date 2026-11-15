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
  constructor(fsp?: number) {
    super(
      'DATE',
      fsp === undefined ? 'TIMESTAMP WITH TIME ZONE' : `TIMESTAMP(${fsp}) WITH TIME ZONE`,
    );
    Object.freeze(this);
  }
}
