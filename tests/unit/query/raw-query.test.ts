import { describe, expect, it } from 'vitest';
import { literal } from '../../../src/expressions/methods.ts';
import { RawQuery } from '../../../src/query/raw-query.ts';

const rawQuery = new RawQuery();

describe('prepareRawQuery', () => {
  it('returns SQL unchanged without replacements or bind', () => {
    expect(rawQuery.prepare('SELECT :a, ?')).toEqual({ text: 'SELECT :a, ?', values: [] });
  });

  it('binds named replacements and expands arrays', () => {
    expect(
      rawQuery.prepare('SELECT * FROM t WHERE a = :a AND b IN (:ids) AND c = :a', {
        replacements: { a: 1, ids: [2, 3] },
      }),
    ).toEqual({
      text: 'SELECT * FROM t WHERE a = $1 AND b IN ($2, $3) AND c = $4',
      values: [1, 2, 3, 1],
    });
  });

  it('binds positional replacements', () => {
    expect(rawQuery.prepare('SELECT ?, ?', { replacements: ['x', null] })).toEqual({
      text: 'SELECT $1, $2',
      values: ['x', null],
    });
  });

  it('skips strings, identifiers, comments, dollar quotes, casts and jsonb ?| ?&', () => {
    const sql = `SELECT ':a', "?x", $q$ :a ? $q$, x::text, j ?| arr -- :a ?\n/* :a */ , :a`;
    expect(rawQuery.prepare(sql, { replacements: { a: 1 } })).toEqual({
      text: `SELECT ':a', "?x", $q$ :a ? $q$, x::text, j ?| arr -- :a ?\n/* :a */ , $1`,
      values: [1],
    });
  });

  it('inlines parameterless expressions', () => {
    expect(rawQuery.prepare('SELECT :v', { replacements: { v: literal('now()') } }).text).toBe(
      'SELECT now()',
    );
  });

  it('maps bind parameters', () => {
    expect(rawQuery.prepare('SELECT $1, $2', { bind: [1, 2] })).toEqual({
      text: 'SELECT $1, $2',
      values: [1, 2],
    });
    expect(rawQuery.prepare('SELECT $b, $a, $b', { bind: { a: 1, b: 2 } })).toEqual({
      text: 'SELECT $1, $2, $1',
      values: [2, 1],
    });
  });

  it('throws on missing values', () => {
    expect(() => rawQuery.prepare('SELECT :x', { replacements: {} })).toThrow(
      /Missing replacement/,
    );
    expect(() => rawQuery.prepare('SELECT $3', { bind: [1] })).toThrow(/Missing bind/);
  });
});
