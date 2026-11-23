import { AbstractDataType, type DataTypeInput } from './abstract-data-type.ts';

/**
 * Attribute that is not stored in the database (`DataTypes.VIRTUAL`).
 *
 * @internal
 */
export class VirtualType extends AbstractDataType {
  /** The attribute is not stored in the database. */
  readonly isVirtual = true;

  /** Attributes the computed value depends on; a query that selects the virtual attribute selects these instead. */
  readonly dependencies: readonly string[];

  /**
   * @param returnType - Type of the computed value.
   * @param fields - Attributes the value is computed from.
   */
  constructor(returnType?: DataTypeInput, fields: readonly string[] = []) {
    super(
      'VIRTUAL',
      returnType === undefined ? 'VIRTUAL' : AbstractDataType.from(returnType).sqlType,
    );
    this.dependencies = fields;
    Object.freeze(this);
  }
}
