import { describe, expect, it } from 'vitest';
import { col } from '../../../src/expressions/methods.ts';
import { RawQuery } from '../../../src/query/raw-query.ts';

const rawQuery = new RawQuery();

describe('raw query replacements with column expressions', () => {
  it('inlines a quoted column reference without binding a value', () => {
    expect(rawQuery.prepare('SELECT :c FROM t', { replacements: { c: col('t.name') } })).toEqual({
      text: 'SELECT "t"."name" FROM t',
      values: [],
    });
  });

  it('expands arrays that mix values and expressions', () => {
    expect(rawQuery.prepare('SELECT :list', { replacements: { list: [col('a'), 2] } })).toEqual({
      text: 'SELECT "a", $1',
      values: [2],
    });
  });
});
