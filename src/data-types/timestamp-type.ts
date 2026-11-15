import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `TIMESTAMP WITHOUT TIME ZONE` (`DataTypes.TIMESTAMP`); values are `Date` objects whose local
 * wall-clock time is the stored time.
 *
 * @internal
 */
export class TimestampType extends AbstractDataType {
  /** Converts a driver string into a `Date` (local time). */
  readonly parse = (value: unknown): unknown =>
    typeof value === 'string' ? new Date(value) : value;

  /**
   * @param fsp - Fractional seconds precision.
   */
  constructor(fsp?: number) {
    super(
      'TIMESTAMP',
      fsp === undefined
        ? 'TIMESTAMP WITHOUT TIME ZONE'
        : `TIMESTAMP(${AbstractDataType.integer('TIMESTAMP precision', fsp)}) WITHOUT TIME ZONE`,
    );
    Object.freeze(this);
  }
}
