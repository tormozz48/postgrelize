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
  constructor(key: string, sqlType: string) {
    super(key, sqlType);
    Object.freeze(this);
  }
}
