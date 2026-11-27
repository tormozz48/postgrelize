import { NumberType } from './number-type.ts';

/**
 * `REAL` and `DOUBLE PRECISION`.
 *
 * @internal
 */
export class NumericScalarType extends NumberType {
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: number; decimals?: number }>;

  /**
   * @param key - Sequelize v6 type key.
   * @param sqlType - PostgreSQL column type.
   * @param options - Length and decimals, ignored by PostgreSQL.
   */
  constructor(
    key: string,
    sqlType: string,
    options: Readonly<{ length?: number; decimals?: number }> = {},
  ) {
    super(key, sqlType);
    this.options = Object.freeze({ ...options });
    Object.freeze(this);
  }
}
