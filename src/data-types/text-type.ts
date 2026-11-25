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
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: 'tiny' | 'medium' | 'long' }>;

  constructor(size?: 'tiny' | 'medium' | 'long') {
    super('TEXT', 'TEXT');
    this.options = Object.freeze(size === undefined ? {} : { length: size });
    Object.freeze(this);
  }
}
