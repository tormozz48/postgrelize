import { describe, expect, it } from 'vitest';
import { literal } from '../../../src/expressions/methods.ts';
import { prepareRawQuery } from '../../../src/query/raw-query.ts';

describe('prepareRawQuery', () => {
  it('returns SQL unchanged without replacements or bind', () => {
    expect(prepareRawQuery('SELECT :a, ?')).toEqual({ text: 'SELECT :a, ?', values: [] });
  });

  it('binds named replacements and expands arrays', () => {
    expect(
      prepareRawQuery('SELECT * FROM t WHERE a = :a AND b IN (:ids) AND c = :a', {
        replacements: { a: 1, ids: [2, 3] },
      }),
    ).toEqual({
      text: 'SELECT * FROM t WHERE a = $1 AND b IN ($2, $3) AND c = $4',
      values: [1, 2, 3, 1],
    });
  });

  it('binds positional replacements', () => {
    expect(prepareRawQuery('SELECT ?, ?', { replacements: ['x', null] })).toEqual({
      text: 'SELECT $1, $2',
      values: ['x', null],
    });
  });

  it('skips strings, identifiers, comments, dollar quotes, casts and jsonb ?| ?&', () => {
    const sql = `SELECT ':a', "?x", $q$ :a ? $q$, x::text, j ?| arr -- :a ?\n/* :a */ , :a`;
    expect(prepareRawQuery(sql, { replacements: { a: 1 } })).toEqual({
      text: `SELECT ':a', "?x", $q$ :a ? $q$, x::text, j ?| arr -- :a ?\n/* :a */ , $1`,
      values: [1],
    });
  });

  it('inlines parameterless expressions', () => {
    expect(prepareRawQuery('SELECT :v', { replacements: { v: literal('now()') } }).text).toBe(
      'SELECT now()',
    );
  });

  it('maps bind parameters', () => {
    expect(prepareRawQuery('SELECT $1, $2', { bind: [1, 2] })).toEqual({
      text: 'SELECT $1, $2',
      values: [1, 2],
    });
    expect(prepareRawQuery('SELECT $b, $a, $b', { bind: { a: 1, b: 2 } })).toEqual({
      text: 'SELECT $1, $2, $1',
      values: [2, 1],
    });
  });

  it('throws on missing values', () => {
    expect(() => prepareRawQuery('SELECT :x', { replacements: {} })).toThrow(/Missing replacement/);
    expect(() => prepareRawQuery('SELECT $3', { bind: [1] })).toThrow(/Missing bind/);
  });
});
