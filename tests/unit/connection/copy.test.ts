import { describe, expect, it } from 'vitest';
import { CopyEncoder } from '../../../src/connection/copy.ts';

const encoder = new CopyEncoder();

describe('COPY text encoding', () => {
  it('encodes scalars, NULL and escapes control characters', () => {
    expect(encoder.encodeValue(null)).toBe('\\N');
    expect(encoder.encodeValue(true)).toBe('t');
    expect(encoder.encodeValue(1.5)).toBe('1.5');
    expect(encoder.encodeValue('a\tb\nc\\d\re')).toBe('a\\tb\\nc\\\\d\\re');
    expect(encoder.encodeValue(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
    expect(encoder.encodeValue(Buffer.from('hi'))).toBe('\\\\x6869');
    expect(encoder.encodeValue({ a: 'x\ty' })).toBe('{"a":"x\\\\ty"}');
  });

  it('encodes arrays as PostgreSQL array literals', () => {
    expect(encoder.encodeValue(['a b', 'c"d', null, 'e\\f'])).toBe(
      '{"a b","c\\\\"d",NULL,"e\\\\\\\\f"}',
    );
    expect(encoder.encodeRow([1, null, 'x'])).toBe('1\t\\N\tx\n');
  });
});
