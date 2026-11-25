import { AbstractDataType } from './abstract-data-type.ts';

/** Arguments of `DataTypes.ENUM`: values, arrays of values or `{ values }`. */
type EnumArgument = string | readonly string[] | Readonly<{ values: readonly string[] }>;

/**
 * Enumerated values (`DataTypes.ENUM`).
 *
 * @internal
 */
export class EnumType extends AbstractDataType {
  /** Allowed values. */
  readonly values: readonly string[];
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ values: readonly string[] }>;

  /**
   * @param args - Values, arrays of values or `{ values }`, in any combination.
   */
  constructor(...args: readonly EnumArgument[]) {
    super('ENUM', 'ENUM');
    this.values = args.flatMap((arg) =>
      typeof arg === 'string'
        ? [arg]
        : Array.isArray(arg)
          ? arg
          : (arg as Readonly<{ values: readonly string[] }>).values,
    );
    this.options = Object.freeze({ values: this.values });
    Object.freeze(this);
  }
}
