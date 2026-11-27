import { AbstractDataType } from './abstract-data-type.ts';

/**
 * Non-integer numeric types: `UNSIGNED` / `ZEROFILL` are recorded in `options` and ignored by
 * PostgreSQL, like Sequelize v6.
 *
 * @internal
 */
export abstract class NumberType extends AbstractDataType {
  /** `UNSIGNED` flag, no effect in PostgreSQL. */
  get UNSIGNED(): this {
    return this.with({ unsigned: true });
  }

  /** `ZEROFILL` flag, no effect in PostgreSQL. */
  get ZEROFILL(): this {
    return this.with({ zerofill: true });
  }
}
