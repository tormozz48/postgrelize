import { AbstractDataType, type DataType, type DataTypeInput } from './abstract-data-type.ts';
import { ArrayLiteralParser } from './array-literal-parser.ts';

const arrayLiteral = new ArrayLiteralParser();

/**
 * `type[]` (`DataTypes.ARRAY(DataTypes.TEXT)`).
 *
 * @internal
 */
export class ArrayType extends AbstractDataType {
  /** Element type. */
  readonly subtype: DataType;
  /** Arguments the type was created with (v6 `options`): the element type. */
  readonly options: Readonly<{ type: DataType }>;
  /** Converts a driver array literal into an array of strings. */
  readonly parse = (value: unknown): unknown =>
    typeof value === 'string' ? arrayLiteral.parse(value) : value;
  /** Serializes every element; present only when the element type serializes values. */
  declare readonly serialize?: (value: unknown) => unknown;

  /**
   * @param subtype - Element type.
   */
  constructor(subtype: DataTypeInput) {
    const element = AbstractDataType.from(subtype);
    super('ARRAY', `${element.sqlType}[]`);
    this.subtype = element;
    this.options = Object.freeze({ type: element });
    if (element.serialize !== undefined) {
      this.serialize = (value: unknown) =>
        Array.isArray(value) ? value.map((item) => element.serialize?.(item)) : value;
    }
    Object.freeze(this);
  }
}
