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
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: number; binary?: boolean }>;

  constructor(length = 255) {
    super('CHAR', `CHAR(${AbstractDataType.integer('CHAR length', length)})`);
    this.options = Object.freeze({ length });
    Object.freeze(this);
  }
}
