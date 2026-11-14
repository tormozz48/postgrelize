import { describe, expect, it } from 'vitest';
import { encodeCopyRow, encodeCopyValue } from '../../../src/connection/copy.ts';

describe('COPY text encoding', () => {
  it('encodes scalars, NULL and escapes control characters', () => {
    expect(encodeCopyValue(null)).toBe('\\N');
    expect(encodeCopyValue(true)).toBe('t');
    expect(encodeCopyValue(1.5)).toBe('1.5');
    expect(encodeCopyValue('a\tb\nc\\d\re')).toBe('a\\tb\\nc\\\\d\\re');
    expect(encodeCopyValue(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(encodeCopyValue(Buffer.from('hi'))).toBe('\\\\x6869');
    expect(encodeCopyValue({ a: 'x\ty' })).toBe('{"a":"x\\\\ty"}');
  });

  it('encodes arrays as PostgreSQL array literals', () => {
    expect(encodeCopyValue(['a b', 'c"d', null, 'e\\f'])).toBe(
      '{"a b","c\\\\"d",NULL,"e\\\\\\\\f"}',
    );
    expect(encodeCopyRow([1, null, 'x'])).toBe('1\t\\N\tx\n');
  });
});
