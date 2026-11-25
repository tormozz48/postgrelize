import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `BYTEA` (`DataTypes.BLOB`).
 *
 * @internal
 */
export class BlobType extends AbstractDataType {
  /**
   * @param _size - MySQL size; accepted for compatibility and ignored.
   */
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: 'tiny' | 'medium' | 'long'; escape?: boolean }>;

  constructor(size?: 'tiny' | 'medium' | 'long') {
    super('BLOB', 'BYTEA');
    this.options = Object.freeze(size === undefined ? {} : { length: size });
    Object.freeze(this);
  }
}
