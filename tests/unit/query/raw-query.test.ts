import { describe, expect, it } from 'vitest';
import { literal } from '../../../src/expressions/methods.ts';
import { RawQuery } from '../../../src/query/raw-query.ts';

const rawQuery = new RawQuery();

describe('prepareRawQuery', () => {
  it('returns SQL unchanged without replacements or bind', () => {
    expect(rawQuery.prepare('SELECT :a, ?')).toEqual({ text: 'SELECT :a, ?', values: [] });
  });

  it('inlines named replacements as escaped literals and expands arrays', () => {
    expect(
      rawQuery.prepare('SELECT * FROM t WHERE a = :a AND b IN (:ids) AND c = :a', {
        replacements: { a: 1, ids: [2, 3] },
      }),
    ).toEqual({
      text: 'SELECT * FROM t WHERE a = 1 AND b IN (2, 3) AND c = 1',
      values: [],
    });
  });

  it('inlines positional replacements', () => {
    expect(rawQuery.prepare('SELECT ?, ?', { replacements: ['x', null] })).toEqual({
      text: "SELECT 'x', NULL",
      values: [],
    });
  });

  it('escapes quotes and backslashes and keeps a payload inside its literal', () => {
    expect(
      rawQuery.prepare('SELECT :a, :b, :c', {
        replacements: { a: "x'; DROP TABLE t; --", b: 'a\\b', c: { k: "v'" } },
      }).text,
    ).toBe(`SELECT 'x''; DROP TABLE t; --', E'a\\\\b', '{"k":"v''"}'`);
  });

  it('renders booleans, dates and empty arrays', () => {
    expect(
      rawQuery.prepare('SELECT ?, ?, ?', {
        replacements: [true, new Date('2020-01-02T03:04:05.000Z'), false],
      }).text,
    ).toBe("SELECT true, '2020-01-02T03:04:05.000Z', false");
  });

  it('rejects a NUL character and a non-finite number', () => {
    expect(() => rawQuery.prepare('SELECT ?', { replacements: ['a\0b'] })).toThrow(/NUL/);
    expect(() => rawQuery.prepare('SELECT ?', { replacements: [Number.NaN] })).toThrow(
      /non-finite/,
    );
  });

  it('keeps several statements in one text', () => {
    expect(rawQuery.prepare('SELECT :a; SELECT :b', { replacements: { a: 1, b: 2 } })).toEqual({
      text: 'SELECT 1; SELECT 2',
      values: [],
    });
  });

  it('skips strings, identifiers, comments, dollar quotes, casts and jsonb ?| ?&', () => {
    const sql = `SELECT ':a', "?x", $q$ :a ? $q$, x::text, j ?| arr -- :a ?\n/* :a */ , :a`;
    expect(rawQuery.prepare(sql, { replacements: { a: 1 } })).toEqual({
      text: `SELECT ':a', "?x", $q$ :a ? $q$, x::text, j ?| arr -- :a ?\n/* :a */ , 1`,
      values: [],
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
      /Named replacement ":x" has no entry in the replacement map/,
    );
    expect(() => rawQuery.prepare('SELECT $3', { bind: [1] })).toThrow(
      /Named bind parameter "\$3" has no value in the given object/,
    );
  });
});

describe('RawQuery.inject (replacements of a compiled statement)', () => {
  it('returns the statement unchanged without replacements', () => {
    const query = { text: 'SELECT $1', values: [1] };
    expect(rawQuery.inject(query, undefined)).toBe(query);
  });

  it('keeps the bound values of the statement and binds each replacement after them', () => {
    expect(
      rawQuery.inject(
        {
          text: 'SELECT * FROM t WHERE a = $1 AND b > :min AND c IN (:ids) AND d = $2',
          values: ['x', 'y'],
        },
        { min: 5, ids: [1, 2] },
      ),
    ).toEqual({
      text: 'SELECT * FROM t WHERE a = $1 AND b > $2::int4 AND c IN ($3::int4, $4::int4) AND d = $5',
      values: ['x', 5, 1, 2, 'y'],
    });
  });

  it('numbers positional replacements in order and reuses a repeated statement value', () => {
    expect(rawQuery.inject({ text: 'SELECT $1, ?, $1, ?', values: ['v'] }, ['a', 'b'])).toEqual({
      text: 'SELECT $1, $2, $1, $3',
      values: ['v', 'a', 'b'],
    });
  });

  it('never scans a bound value, whatever it contains', () => {
    const payload = "x'; DROP TABLE t; -- :name ? $1";
    expect(
      rawQuery.inject({ text: 'SELECT $1, :name', values: [payload] }, { name: payload }),
    ).toEqual({ text: 'SELECT $1, $2', values: [payload, payload] });
  });

  it('leaves quoted text, comments, casts and unknown $ tokens alone', () => {
    const text = `SELECT ':a', ":a", $$:a$$, a::int, $name, $9 -- :a`;
    expect(rawQuery.inject({ text, values: [] }, { a: 1 })).toEqual({ text, values: [] });
  });

  it('throws for a placeholder without a replacement value', () => {
    expect(() => rawQuery.inject({ text: 'SELECT :x', values: [] }, { y: 1 })).toThrow(
      /Named replacement ":x" has no entry in the replacement map/,
    );
  });

  it('types integers and booleans of a compiled statement and leaves other values alone', () => {
    expect(
      rawQuery.inject({ text: 'SELECT ?, ?, ?, ?, ?, ?', values: [] }, [
        1,
        true,
        1.5,
        3_000_000_000,
        'x',
        null,
      ]),
    ).toEqual({
      text: 'SELECT $1::int4, $2::boolean, $3, $4, $5, $6',
      values: [1, true, 1.5, 3_000_000_000, 'x', null],
    });
  });
});
