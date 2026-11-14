import { describe, expect, it } from 'vitest';
import { parseArrayLiteral } from '../../src/data-types/array-literal.ts';

describe('parseArrayLiteral', () => {
  it('parses plain, quoted, NULL and nested elements', () => {
    expect(parseArrayLiteral('{}')).toEqual([]);
    expect(parseArrayLiteral('{ADMIN,CLIENT}')).toEqual(['ADMIN', 'CLIENT']);
    expect(parseArrayLiteral('{"a b","c,d","e\\"f","g\\\\h",NULL,"NULL"}')).toEqual([
      'a b',
      'c,d',
      'e"f',
      'g\\h',
      null,
      'NULL',
    ]);
    expect(parseArrayLiteral('{{1,2},{3,NULL}}')).toEqual([
      ['1', '2'],
      ['3', null],
    ]);
  });
});
