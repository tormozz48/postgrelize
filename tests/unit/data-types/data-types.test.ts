import { describe, expect, it } from 'vitest';
import { AbstractDataType } from '../../../src/data-types/abstract-data-type.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';

describe('DataTypes', () => {
  it('is usable bare or called', () => {
    expect(AbstractDataType.from(DataTypes.STRING).sqlType).toBe('VARCHAR(255)');
    expect(AbstractDataType.from(DataTypes.STRING(64)).sqlType).toBe('VARCHAR(64)');
    expect(AbstractDataType.from(DataTypes.DECIMAL(10, 2)).sqlType).toBe('DECIMAL(10,2)');
    expect(AbstractDataType.from(DataTypes.DECIMAL).sqlType).toBe('DECIMAL');
    expect(AbstractDataType.from(DataTypes.DATE).sqlType).toBe('TIMESTAMP WITH TIME ZONE');
    expect(AbstractDataType.from(DataTypes.GEOMETRY('POINT', 4326)).sqlType).toBe(
      'GEOMETRY(POINT,4326)',
    );
  });

  it('keeps MySQL modifiers as no-ops', () => {
    expect(DataTypes.INTEGER.UNSIGNED.ZEROFILL.sqlType).toBe('INTEGER');
  });

  it('serializes JSON values to strings', () => {
    expect(DataTypes.JSONB.serialize?.([1, { a: 2 }])).toBe('[1,{"a":2}]');
    expect(DataTypes.JSONB.serialize?.(null)).toBeNull();
    expect(DataTypes.JSONB.isJson).toBe(true);
  });

  it('builds arrays with element serialization', () => {
    const type = DataTypes.ARRAY(DataTypes.JSONB);
    expect(type.sqlType).toBe('JSONB[]');
    expect(type.serialize?.([{ a: 1 }])).toEqual(['{"a":1}']);
    expect(DataTypes.ARRAY(DataTypes.TEXT).serialize).toBeUndefined();
  });

  it('serializes and parses ranges like Sequelize v6', () => {
    const range = AbstractDataType.from(DataTypes.RANGE(DataTypes.INTEGER));
    expect(range.sqlType).toBe('INT4RANGE');
    expect(range.serialize?.([1, 5])).toBe('[1,5)');
    expect(
      range.serialize?.([
        { value: 1, inclusive: false },
        { value: 5, inclusive: true },
      ]),
    ).toBe('(1,5]');
    expect(range.serialize?.([null, 5])).toBe('[,5)');
    expect(range.serialize?.([])).toBe('empty');
    expect(range.parse?.('[1,5)')).toEqual([
      { value: 1, inclusive: true },
      { value: 5, inclusive: false },
    ]);
    expect(range.parse?.('empty')).toEqual([]);
    expect(() => DataTypes.RANGE(DataTypes.STRING)).toThrow(/RANGE/);
  });

  it('collects ENUM values from all call shapes', () => {
    expect(DataTypes.ENUM('a', 'b').values).toEqual(['a', 'b']);
    expect(DataTypes.ENUM({ values: ['c'] }).values).toEqual(['c']);
  });

  it('marks VIRTUAL and generates defaults', () => {
    expect(AbstractDataType.from(DataTypes.VIRTUAL).isVirtual).toBe(true);
    expect(DataTypes.UUIDV4.generate()).toMatch(/^[0-9a-f-]{36}$/);
    expect(DataTypes.NOW.generate()).toBeInstanceOf(Date);
  });
});
