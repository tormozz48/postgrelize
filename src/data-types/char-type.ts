import { AbstractDataType } from './abstract-data-type.ts';

/**
 * `CHAR(length)` (`DataTypes.CHAR`).
 *
 * @internal
 */
export class CharType extends AbstractDataType {
  /**
   * @param length - Fixed length; default 255.
   * @param binary - Store as `BYTEA`, like Sequelize v6 on PostgreSQL.
   */
  /** Arguments the type was created with (v6 `options`). */
  readonly options: Readonly<{ length?: number; binary?: boolean }>;

  constructor(length = 255, binary?: boolean) {
    const sized = `CHAR(${AbstractDataType.integer('CHAR length', length)})`;
    super('CHAR', binary === true ? 'BYTEA' : sized);
    this.options = Object.freeze({ length, ...(binary === undefined ? {} : { binary }) });
    Object.freeze(this);
  }

  /** The same type stored as `BYTEA`. */
  get BINARY(): this {
    return this.with({ binary: true }, 'BYTEA');
  }
}
