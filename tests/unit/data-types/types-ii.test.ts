import { describe, expect, it } from 'vitest';
import { DataTypes } from '../../../src/data-types/data-types.ts';

const p = (x: number, y: number): { x: number; y: number } => ({ x, y });

describe('geometric types', () => {
  it('serializes values to PostgreSQL literals', () => {
    expect(DataTypes.POINT.serialize?.(p(1, -2.5))).toBe('(1,-2.5)');
    expect(DataTypes.LINE.serialize?.({ a: 1, b: -1, c: 0 })).toBe('{1,-1,0}');
    expect(DataTypes.LSEG.serialize?.([p(0, 0), p(1, 1)])).toBe('[(0,0),(1,1)]');
    expect(DataTypes.BOX.serialize?.([p(2, 2), p(0, 0)])).toBe('(2,2),(0,0)');
    expect(DataTypes.PATH.serialize?.({ points: [p(0, 0), p(1, 1)], closed: true })).toBe(
      '((0,0),(1,1))',
    );
    expect(DataTypes.PATH.serialize?.({ points: [p(0, 0), p(1, 1)], closed: false })).toBe(
      '[(0,0),(1,1)]',
    );
    expect(DataTypes.POLYGON.serialize?.([p(0, 0), p(1, 0), p(1, 1)])).toBe('((0,0),(1,0),(1,1))');
    expect(DataTypes.CIRCLE.serialize?.({ x: 1, y: 2, radius: 3 })).toBe('<(1,2),3>');
  });

  it('keeps text and null, rejects bad values', () => {
    expect(DataTypes.POINT.serialize?.('(1,2)')).toBe('(1,2)');
    expect(DataTypes.POINT.serialize?.(null)).toBeNull();
    expect(() => DataTypes.POINT.serialize?.({ x: 1, y: Number.NaN })).toThrow(/finite/);
    expect(() => DataTypes.POINT.serialize?.({ x: '1) , (', y: 1 })).toThrow(/finite/);
    expect(() => DataTypes.POINT.serialize?.(5)).toThrow(/object/);
    expect(() => DataTypes.POLYGON.serialize?.('x'.length)).toThrow(/array/);
    expect(() => DataTypes.LSEG.serialize?.([p(0, 0)])).toThrow(/two points/);
  });

  it('parses driver literals', () => {
    expect(DataTypes.POINT.parse?.('(1,-2.5)')).toEqual(p(1, -2.5));
    expect(DataTypes.LINE.parse?.('{1,-1,0}')).toEqual({ a: 1, b: -1, c: 0 });
    expect(DataTypes.LSEG.parse?.('[(0,0),(1,1)]')).toEqual([p(0, 0), p(1, 1)]);
    expect(DataTypes.BOX.parse?.('(2,2),(0,0)')).toEqual([p(2, 2), p(0, 0)]);
    expect(DataTypes.PATH.parse?.('((0,0),(1,1))')).toEqual({
      points: [p(0, 0), p(1, 1)],
      closed: true,
    });
    expect(DataTypes.PATH.parse?.('[(0,0),(1,1e2)]')).toEqual({
      points: [p(0, 0), p(1, 100)],
      closed: false,
    });
    expect(DataTypes.POLYGON.parse?.('((0,0),(1,0),(1,1))')).toHaveLength(3);
    expect(DataTypes.CIRCLE.parse?.('<(1,2),3>')).toEqual({ x: 1, y: 2, radius: 3 });
    expect(DataTypes.POINT.parse?.({ x: 1, y: 2 })).toEqual(p(1, 2));
    expect(DataTypes.POINT.parse?.(null)).toBeNull();
  });

  it('uses the type name as SQL type', () => {
    expect(DataTypes.POLYGON.sqlType).toBe('POLYGON');
    expect(DataTypes.BOX.key).toBe('BOX');
  });
});

const bound = (value: unknown, inclusive: boolean): { value: unknown; inclusive: boolean } => ({
  value,
  inclusive,
});

describe('MULTIRANGE', () => {
  const ints = DataTypes.MULTIRANGE(DataTypes.INTEGER);

  it('maps subtypes to multirange SQL types', () => {
    expect(ints.sqlType).toBe('INT4MULTIRANGE');
    expect(DataTypes.MULTIRANGE.sqlType).toBe('INT4MULTIRANGE');
    expect(DataTypes.MULTIRANGE(DataTypes.BIGINT).sqlType).toBe('INT8MULTIRANGE');
    expect(DataTypes.MULTIRANGE(DataTypes.DECIMAL).sqlType).toBe('NUMMULTIRANGE');
    expect(DataTypes.MULTIRANGE(DataTypes.TIMESTAMP).sqlType).toBe('TSMULTIRANGE');
    expect(DataTypes.MULTIRANGE(DataTypes.DATE).sqlType).toBe('TSTZMULTIRANGE');
    expect(DataTypes.MULTIRANGE(DataTypes.DATEONLY).sqlType).toBe('DATEMULTIRANGE');
    expect(() => DataTypes.MULTIRANGE(DataTypes.TEXT)).toThrow(/does not support/);
  });

  it('serializes arrays of ranges', () => {
    expect(
      ints.serialize?.([
        [1, 5],
        [10, 20],
      ]),
    ).toBe('{[1,5),[10,20)}');
    expect(ints.serialize?.([[bound(1, false), bound(null, false)]])).toBe('{(1,)}');
    expect(ints.serialize?.([])).toBe('{}');
    expect(ints.serialize?.('{[1,2)}')).toBe('{[1,2)}');
  });

  it('parses multirange literals', () => {
    expect(ints.parse?.('{[1,5),(10,20]}')).toEqual([
      [bound(1, true), bound(5, false)],
      [bound(10, false), bound(20, true)],
    ]);
    expect(ints.parse?.('{}')).toEqual([]);
    expect(ints.parse?.(null)).toBeNull();
    const dates = DataTypes.MULTIRANGE(DataTypes.TIMESTAMP);
    expect(dates.parse?.('{["2024-01-01 00:00:00","2024-01-02 00:00:00"),[,)}')).toHaveLength(2);
  });

  it('writes timestamp bounds as local wall-clock time', () => {
    const dates = DataTypes.MULTIRANGE(DataTypes.TIMESTAMP);
    expect(dates.serialize?.([[new Date(2024, 0, 2, 3, 4, 5, 6), new Date(2024, 0, 3)]])).toBe(
      '{[2024-01-02 03:04:05.006,2024-01-03 00:00:00.000)}',
    );
  });
});
