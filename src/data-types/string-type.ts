import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `VARCHAR(length)` (`DataTypes.STRING`).
 *
 * @internal
 */
export class StringType extends AbstractDataType {
  /**
   * @param length - Maximum length; default 255.
   */
  constructor(length = 255) {
    super('STRING', `VARCHAR(${length})`);
    Object.freeze(this);
  }
}
