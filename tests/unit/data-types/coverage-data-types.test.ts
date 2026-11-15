import { describe, expect, it } from 'vitest';
import { AbstractDataType } from '../../../src/data-types/abstract-data-type.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';

const sql = (type: Parameters<typeof AbstractDataType.from>[0]) =>
  AbstractDataType.from(type).sqlType;

describe('DataTypes factories', () => {
  it('accepts a size for TEXT and BLOB and ignores it', () => {
    expect(sql(DataTypes.TEXT('long'))).toBe('TEXT');
    expect(sql(DataTypes.BLOB('tiny'))).toBe('BYTEA');
    expect(sql(DataTypes.BLOB)).toBe('BYTEA');
  });

  it('builds NUMBER like DECIMAL', () => {
    expect(sql(DataTypes.NUMBER(8, 3))).toBe('DECIMAL(8,3)');
    expect(sql(DataTypes.NUMBER)).toBe('DECIMAL');
  });

  it('builds GEOGRAPHY with type and srid', () => {
    expect(sql(DataTypes.GEOGRAPHY('POINT', 4326))).toBe('GEOGRAPHY(POINT,4326)');
    expect(sql(DataTypes.GEOGRAPHY)).toBe('GEOGRAPHY');
  });

  it('builds VIRTUAL with a return type and ignored dependency fields', () => {
    expect(AbstractDataType.from(DataTypes.VIRTUAL(DataTypes.INTEGER, ['a', 'b'])).isVirtual).toBe(
      true,
    );
    expect(AbstractDataType.from(DataTypes.VIRTUAL).isVirtual).toBe(true);
  });
});
