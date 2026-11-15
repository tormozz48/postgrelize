import { describe, expect, it } from 'vitest';
import { IdentifierQuoter } from '../../../src/sql/identifier-quoter.ts';

describe('IdentifierQuoter', () => {
  it('quotes names and doubles embedded quotes', () => {
    const quoter = new IdentifierQuoter();
    expect(quoter.quote('users')).toBe('"users"');
    expect(quoter.quote('we"ird')).toBe('"we""ird"');
    expect(quoter.quote('')).toBe('""');
  });

  it('returns the same text on repeated calls and keeps working past the memo limit', () => {
    const quoter = new IdentifierQuoter();
    expect(quoter.quote('a')).toBe(quoter.quote('a'));
    for (let index = 0; index < 5000; index += 1) {
      expect(quoter.quote(`n${index}`)).toBe(`"n${index}"`);
    }
    expect(quoter.quote('n4999')).toBe('"n4999"');
    expect(quoter.quote('late"name')).toBe('"late""name"');
  });
});
