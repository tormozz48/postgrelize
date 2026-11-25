import { AbstractDataType } from './abstract-data-type.ts';

/**
 * Type without parameters or value conversions (`BOOLEAN`, `UUID`, `INET`, ...).
 *
 * @internal
 */
export class ScalarType extends AbstractDataType {
  /**
   * @param key - Sequelize v6 type key.
   * @param sqlType - PostgreSQL column type.
   */
  /** Arguments the type was created with (v6 `options`); these types take none. */
  readonly options: Readonly<{ length?: number; decimals?: number }> = Object.freeze({});

  constructor(key: string, sqlType: string) {
    super(key, sqlType);
    Object.freeze(this);
  }
}
