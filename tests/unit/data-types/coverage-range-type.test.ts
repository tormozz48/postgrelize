import { describe, expect, it } from 'vitest';
import { AbstractDataType } from '../../../src/data-types/abstract-data-type.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';

const range = (subtype: Parameters<typeof DataTypes.RANGE>[0]) =>
  AbstractDataType.from(DataTypes.RANGE(subtype));

describe('RANGE data type', () => {
  it('maps every supported element type to its range type', () => {
    expect(range(DataTypes.BIGINT).sqlType).toBe('INT8RANGE');
    expect(range(DataTypes.DECIMAL).sqlType).toBe('NUMRANGE');
    expect(range(DataTypes.DATE).sqlType).toBe('TSTZRANGE');
    expect(range(DataTypes.DATEONLY).sqlType).toBe('DATERANGE');
    expect(AbstractDataType.from(DataTypes.RANGE).sqlType).toBe('INT4RANGE');
  });

  it('passes through values that are not arrays or strings', () => {
    const type = range(DataTypes.INTEGER);
    expect(type.serialize?.('[1,5)')).toBe('[1,5)');
    expect(type.serialize?.(null)).toBeNull();
    expect(type.parse?.(null)).toBeNull();
    expect(type.parse?.({ a: 1 })).toEqual({ a: 1 });
    expect(type.parse?.('not a range')).toBe('not a range');
  });

  it('serializes date bounds as ISO strings', () => {
    const lower = new Date('2024-01-01T00:00:00.000Z');
    const upper = new Date('2024-02-01T00:00:00.000Z');
    expect(range(DataTypes.DATE).serialize?.([lower, upper])).toBe(
      '[2024-01-01T00:00:00.000Z,2024-02-01T00:00:00.000Z)',
    );
    expect(range(DataTypes.DATE).serialize?.([lower, null])).toBe('[2024-01-01T00:00:00.000Z,)');
  });

  it('parses unbounded sides and quoted bounds', () => {
    expect(range(DataTypes.INTEGER).parse?.('(,5]')).toEqual([
      { value: null, inclusive: false },
      { value: 5, inclusive: true },
    ]);
    expect(range(DataTypes.BIGINT).parse?.('[1,)')).toEqual([
      { value: 1, inclusive: true },
      { value: null, inclusive: false },
    ]);
    expect(range(DataTypes.DECIMAL).parse?.('[1.5,2.5)')).toEqual([
      { value: '1.5', inclusive: true },
      { value: '2.5', inclusive: false },
    ]);
    const dates = range(DataTypes.DATEONLY).parse?.('[2024-01-01,2024-02-01)');
    expect(dates).toEqual([
      { value: '2024-01-01', inclusive: true },
      { value: '2024-02-01', inclusive: false },
    ]);
  });

  it('parses timestamp bounds into dates', () => {
    const parsed = range(DataTypes.DATE).parse?.(
      '["2024-01-01 00:00:00+00","2024-02-01 00:00:00+00")',
    ) as { value: unknown }[];
    expect(parsed[0]?.value).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    expect(parsed[1]?.value).toEqual(new Date('2024-02-01T00:00:00.000Z'));
  });
});
