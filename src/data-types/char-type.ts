import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `CHAR(length)` (`DataTypes.CHAR`).
 *
 * @internal
 */
export class CharType extends AbstractDataType {
  /**
   * @param length - Fixed length; default 255.
   */
  constructor(length = 255) {
    super('CHAR', `CHAR(${AbstractDataType.integer('CHAR length', length)})`);
    Object.freeze(this);
  }
}
