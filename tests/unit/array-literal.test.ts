import { describe, expect, it } from 'vitest';
import { ArrayLiteralParser } from '../../src/data-types/array-literal-parser.ts';

const arrayLiteral = new ArrayLiteralParser();

describe('parseArrayLiteral', () => {
  it('parses plain, quoted, NULL and nested elements', () => {
    expect(arrayLiteral.parse('{}')).toEqual([]);
    expect(arrayLiteral.parse('{ADMIN,CLIENT}')).toEqual(['ADMIN', 'CLIENT']);
    expect(arrayLiteral.parse('{"a b","c,d","e\\"f","g\\\\h",NULL,"NULL"}')).toEqual([
      'a b',
      'c,d',
      'e"f',
      'g\\h',
      null,
      'NULL',
    ]);
    expect(arrayLiteral.parse('{{1,2},{3,NULL}}')).toEqual([
      ['1', '2'],
      ['3', null],
    ]);
  });
});
