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
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: number; binary?: boolean }>;

  constructor(length = 255) {
    super('STRING', `VARCHAR(${AbstractDataType.integer('STRING length', length)})`);
    this.options = Object.freeze({ length });
    Object.freeze(this);
  }
}
