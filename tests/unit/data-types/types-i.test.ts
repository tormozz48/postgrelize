import { describe, expect, it } from 'vitest';
import { AbstractDataType } from '../../../src/data-types/abstract-data-type.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';

describe('HSTORE', () => {
  const { serialize, parse } = DataTypes.HSTORE;

  it('serializes objects to hstore text', () => {
    expect(serialize?.({ a: '1', b: null, c: 2, d: { x: 1 }, e: undefined })).toBe(
      '"a"=>"1","b"=>NULL,"c"=>"2","d"=>"{\\"x\\":1}"',
    );
    expect(serialize?.({ 'k"\\': 'v"\\' })).toBe('"k\\"\\\\"=>"v\\"\\\\"');
    expect(serialize?.({})).toBe('');
  });

  it('keeps hstore text, null and arrays as they are', () => {
    expect(serialize?.('"a"=>"1"')).toBe('"a"=>"1"');
    expect(serialize?.(null)).toBeNull();
    expect(serialize?.(['x'])).toEqual(['x']);
  });

  it('parses hstore text into objects', () => {
    expect(parse?.('"a"=>"1", "b"=>NULL, "c d"=>"x, \\"y\\" => \\\\"')).toEqual({
      a: '1',
      b: null,
      'c d': 'x, "y" => \\',
    });
    expect(parse?.('')).toEqual({});
    expect(parse?.(null)).toBeNull();
    expect(parse?.({ a: '1' })).toEqual({ a: '1' });
  });

  it('round-trips awkward keys and values', () => {
    const value = { '=>': ',', '"': '\\', ' ': '', NULL: 'NULL' };
    expect(parse?.(serialize?.(value))).toEqual(value);
  });
});

const sql = (type: Parameters<typeof AbstractDataType.from>[0]) =>
  AbstractDataType.from(type).sqlType;

describe('S14 column types', () => {
  it('renders SQL types', () => {
    expect(sql(DataTypes.LTREE)).toBe('LTREE');
    expect(sql(DataTypes.TIMESTAMP)).toBe('TIMESTAMP WITHOUT TIME ZONE');
    expect(sql(DataTypes.TIMESTAMP(3))).toBe('TIMESTAMP(3) WITHOUT TIME ZONE');
    expect(sql(DataTypes.MONEY)).toBe('MONEY');
    expect(sql(DataTypes.MACADDR8)).toBe('MACADDR8');
    expect(sql(DataTypes.XML)).toBe('XML');
    expect(sql(DataTypes.BIT)).toBe('BIT');
    expect(sql(DataTypes.BIT(8))).toBe('BIT(8)');
    expect(sql(DataTypes.VARBIT)).toBe('BIT VARYING');
    expect(sql(DataTypes.VARBIT(16))).toBe('BIT VARYING(16)');
    expect(sql(DataTypes.TSQUERY)).toBe('TSQUERY');
    expect(sql(DataTypes.ARRAY(DataTypes.LTREE))).toBe('LTREE[]');
  });

  it('rejects invalid parameters before they reach SQL', () => {
    expect(() => DataTypes.BIT('8); DROP TABLE x; --' as unknown as number)).toThrow(
      'BIT length must be a non-negative integer',
    );
    expect(() => DataTypes.VARBIT(-1)).toThrow('VARBIT length must be a non-negative integer');
    expect(() => DataTypes.TIMESTAMP(1.5)).toThrow(
      'TIMESTAMP precision must be a non-negative integer',
    );
  });

  it('parses timestamp strings into Dates', () => {
    expect(DataTypes.TIMESTAMP.parse?.('2024-01-02 03:04:05')).toEqual(
      new Date(2024, 0, 2, 3, 4, 5),
    );
    const date = new Date();
    expect(DataTypes.TIMESTAMP.parse?.(date)).toBe(date);
  });

  it('uses the Sequelize v6 type keys', () => {
    expect(DataTypes.HSTORE.key).toBe('HSTORE');
    expect(DataTypes.VARBIT.key).toBe('VARBIT');
    expect(DataTypes.TIMESTAMP.key).toBe('TIMESTAMP');
  });
});
