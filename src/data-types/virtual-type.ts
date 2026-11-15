import { AbstractDataType, type DataTypeInput } from './abstract-data-type.ts';

/**
 * Attribute that is not stored in the database (`DataTypes.VIRTUAL`).
 *
 * @internal
 */
export class VirtualType extends AbstractDataType {
  /** The attribute is not stored in the database. */
  readonly isVirtual = true;

  /**
   * @param returnType - Type of the computed value.
   * @param _fields - Dependency fields; accepted for compatibility and ignored.
   */
  constructor(returnType?: DataTypeInput, _fields?: readonly string[]) {
    super(
      'VIRTUAL',
      returnType === undefined ? 'VIRTUAL' : AbstractDataType.from(returnType).sqlType,
    );
    Object.freeze(this);
  }
}
