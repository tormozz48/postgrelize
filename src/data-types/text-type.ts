import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `TEXT` (`DataTypes.TEXT`).
 *
 * @internal
 */
export class TextType extends AbstractDataType {
  /**
   * @param _size - MySQL size; accepted for compatibility and ignored.
   */
  constructor(_size?: 'tiny' | 'medium' | 'long') {
    super('TEXT', 'TEXT');
    Object.freeze(this);
  }
}
