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
  constructor(_size?: 'tiny' | 'medium' | 'long') {
    super('BLOB', 'BYTEA');
    Object.freeze(this);
  }
}
