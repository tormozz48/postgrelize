import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `BIT(length)` / `BIT VARYING(length)` (`DataTypes.BIT`, `DataTypes.VARBIT`); values are strings
 * of `0` and `1`.
 *
 * @internal
 */
export class BitType extends AbstractDataType {
  /**
   * @param key - `'BIT'` or `'VARBIT'`.
   * @param length - Number of bits; `BIT` defaults to 1, `VARBIT` to unlimited.
   */
  constructor(key: 'BIT' | 'VARBIT', length?: number) {
    const sqlName = key === 'BIT' ? 'BIT' : 'BIT VARYING';
    super(
      key,
      length === undefined
        ? sqlName
        : `${sqlName}(${AbstractDataType.integer(`${key} length`, length)})`,
    );
    Object.freeze(this);
  }
}
