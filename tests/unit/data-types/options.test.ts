import { describe, expect, it } from 'vitest';
import { DataTypes } from '../../../src/index.ts';

describe('data type options and toSql (v6 DataTypes.<X>DataType members)', () => {
  it('carries the arguments the type was created with', () => {
    const decimal: DataTypes.DecimalDataType = DataTypes.DECIMAL(10, 2);
    expect(decimal.options).toEqual({ precision: 10, scale: 2 });
    expect(DataTypes.DECIMAL.options).toEqual({});
    expect(DataTypes.STRING(64).options.length).toBe(64);
    expect(DataTypes.CHAR(8).options.length).toBe(8);
    expect(DataTypes.TEXT('tiny').options).toEqual({ length: 'tiny' });
    expect(DataTypes.FLOAT(8).options).toEqual({ length: 8 });
    expect(DataTypes.DATE(3).options).toEqual({ length: 3 });
    expect(DataTypes.BLOB('long').options).toEqual({ length: 'long' });
    expect(DataTypes.GEOMETRY('POINT', 4326).options).toEqual({ type: 'POINT', srid: 4326 });
    expect(DataTypes.GEOGRAPHY.options).toEqual({});
    expect(DataTypes.INTEGER.options).toEqual({});
    expect(DataTypes.REAL.options).toEqual({});
  });

  it('exposes the element types and values of the composite types', () => {
    const enumeration = DataTypes.ENUM('a', 'b');
    expect(enumeration.values).toEqual(['a', 'b']);
    expect(enumeration.options).toEqual({ values: ['a', 'b'] });
    expect(DataTypes.ARRAY(DataTypes.STRING).options.type).toBe(DataTypes.STRING);
    expect(DataTypes.RANGE(DataTypes.INTEGER).options.subtype).toBe(DataTypes.INTEGER);
    const virtual = DataTypes.VIRTUAL(DataTypes.STRING, ['first']);
    expect(virtual.fields).toEqual(['first']);
    expect(virtual.returnType).toBe(DataTypes.STRING);
    expect(DataTypes.VIRTUAL.returnType).toBeUndefined();
  });

  it('toSql returns the PostgreSQL column type', () => {
    expect(DataTypes.DECIMAL(10, 2).toSql()).toBe('DECIMAL(10,2)');
    expect(DataTypes.STRING(64).toSql()).toBe('VARCHAR(64)');
    expect(DataTypes.INTEGER.toSql()).toBe('INTEGER');
  });
});
