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

describe('COMPOSITE', () => {
  const address = DataTypes.COMPOSITE('address', {
    street: DataTypes.TEXT,
    zip: DataTypes.INTEGER,
    primary: DataTypes.BOOLEAN,
    meta: DataTypes.JSONB,
    seen: DataTypes.TIMESTAMP,
    data: DataTypes.BLOB,
    big: DataTypes.BIGINT,
  });

  it('quotes the type name and renders CREATE TYPE', () => {
    expect(address.sqlType).toBe('"address"');
    expect(DataTypes.COMPOSITE('we"ird', { 'a"b': DataTypes.TEXT }).createSql()).toBe(
      'CREATE TYPE "we""ird" AS ("a""b" TEXT)',
    );
    expect(address.createSql()).toContain('"zip" INTEGER, "primary" BOOLEAN, "meta" JSONB');
    expect(() => DataTypes.COMPOSITE('empty', {})).toThrow(/at least one field/);
  });

  it('serializes objects to record text', () => {
    expect(
      address.serialize?.({
        street: 'Main "St", (1)',
        zip: 12345,
        primary: true,
        meta: { a: [1] },
        seen: new Date(2024, 0, 2, 3, 4, 5, 6),
        data: Buffer.from([1, 255]),
        big: '9007199254740993',
      }),
    ).toBe(
      '("Main ""St"", (1)",12345,t,"{""a"":[1]}","2024-01-02 03:04:05.006","\\\\x01ff",9007199254740993)',
    );
    expect(address.serialize?.({ street: '', zip: null })).toBe('("",,,,,,)');
    expect(address.serialize?.('(x,1)')).toBe('(x,1)');
    expect(address.serialize?.(null)).toBeNull();
  });

  it('parses record text into objects', () => {
    const text =
      '("Main ""St"", \\\\ (1)",12345,t,"{""a"":[1]}","2024-01-02 03:04:05.006","\\\\x01ff",9007199254740993)';
    expect(address.parse?.(text)).toEqual({
      street: 'Main "St", \\ (1)',
      zip: 12345,
      primary: true,
      meta: { a: [1] },
      seen: new Date(2024, 0, 2, 3, 4, 5, 6),
      data: Buffer.from([1, 255]),
      big: '9007199254740993',
    });
    expect(address.parse?.('("",,f,,,,)')).toMatchObject({ street: '', zip: null, primary: false });
    expect(address.parse?.({ street: 'x' })).toEqual({ street: 'x' });
  });

  it('nests composites and rejects arrays', () => {
    const inner = DataTypes.COMPOSITE('point2', { x: DataTypes.INTEGER, y: DataTypes.INTEGER });
    const outer = DataTypes.COMPOSITE('segment', { from: inner, to: inner, label: DataTypes.TEXT });
    const value = { from: { x: 1, y: 2 }, to: { x: 3, y: null }, label: 'a b' };
    const text = outer.serialize?.(value) as string;
    expect(text).toBe('("(1,2)","(3,)","a b")');
    expect(outer.parse?.(text)).toEqual(value);
    const withArray = DataTypes.COMPOSITE('arr', { list: DataTypes.ARRAY(DataTypes.TEXT) });
    expect(() => withArray.serialize?.({ list: ['a'] })).toThrow(/array/);
  });
});

describe('GEOMETRY / GEOGRAPHY', () => {
  const { parse, serialize } = DataTypes.GEOMETRY;
  const crs = { type: 'name', properties: { name: 'EPSG:4326' } };
  const geometries = [
    { type: 'Point', coordinates: [1, 2] },
    { type: 'Point', coordinates: [1, 2, 3] },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1.5],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [1, 1],
        ],
      ],
    },
    {
      type: 'MultiPoint',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    },
    {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    },
    {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      ],
    },
    {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 2] },
        {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    },
  ];

  it('writes known EWKB', () => {
    expect(serialize?.({ type: 'Point', coordinates: [1, 2] })).toBe(
      '0101000020e6100000000000000000f03f0000000000000040',
    );
    expect(
      serialize?.({
        type: 'Point',
        coordinates: [1, 2],
        crs: { properties: { name: 'urn:ogc:def:crs:EPSG::3857' } },
      }),
    ).toBe('0101000020110f0000000000000000f03f0000000000000040');
  });

  it('round-trips every geometry type with its SRID', () => {
    for (const geometry of geometries) {
      expect(parse?.(serialize?.(geometry) as string)).toEqual({ ...geometry, crs });
    }
  });

  it('reads big-endian EWKB without SRID', () => {
    expect(parse?.('00000000013ff00000000000004000000000000000')).toEqual({
      type: 'Point',
      coordinates: [1, 2],
    });
    expect(parse?.('0101000000000000000000f87f000000000000f87f')).toEqual({
      type: 'Point',
      coordinates: [],
    });
  });

  it('skips the M coordinate and keeps other values', () => {
    expect(
      parse?.('01010000400000000000000000000000000000004000000000000008 40'.replace(' ', '')),
    ).toEqual({
      type: 'Point',
      coordinates: [0, 2],
    });
    expect(parse?.('POINT(1 2)')).toBe('POINT(1 2)');
    expect(parse?.(null)).toBeNull();
    expect(serialize?.('POINT(1 2)')).toBe('POINT(1 2)');
    expect(DataTypes.GEOGRAPHY.serialize?.(geometries[0])).toBe(serialize?.(geometries[0]));
  });

  it('rejects malformed GeoJSON and unsupported EWKB', () => {
    expect(() => serialize?.({ type: 'Curve', coordinates: [] })).toThrow(/Unsupported GeoJSON/);
    expect(() => serialize?.({ type: 'Point', coordinates: [1, 'x'] })).toThrow(/finite numbers/);
    expect(() => serialize?.({ type: 'Point', coordinates: [1, Number.NaN] })).toThrow(/finite/);
    expect(() => serialize?.({ type: 'LineString', coordinates: 'x' })).toThrow(/arrays/);
    expect(() => serialize?.([1])).toThrow(/object/);
    expect(() => parse?.('010800000000000000')).toThrow(/Unsupported EWKB/);
  });
});
