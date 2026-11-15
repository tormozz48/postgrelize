import { describe, expect, it } from 'vitest';
import { BuiltinValidators } from '../../../src/validation/builtin-validators.ts';

const builtinValidators = new BuiltinValidators();

const check = (name: string, value: string, ...args: unknown[]) =>
  builtinValidators.find(name)?.(value, ...args);

describe('built-in validators: v6 extensions', () => {
  it('validates URLs and IP addresses', () => {
    expect(check('isUrl', 'https://example.com/a?b=1')).toBe(true);
    expect(check('isUrl', 'not a url')).toBe(false);
    expect(check('isIPv4', '192.168.0.1')).toBe(true);
    expect(check('isIPv4', '::1')).toBe(false);
    expect(check('isIPv6', '::1')).toBe(true);
    expect(check('isIPv6', '192.168.0.1')).toBe(false);
  });

  it('matches regular expressions given as source with modifiers', () => {
    expect(check('regex', 'ABC', '^abc$', 'i')).toBe(true);
    expect(check('regex', 'ABC', '^abc$')).toBe(false);
    expect(check('notRegex', 'ABC', '^abc$', 'i')).toBe(false);
    expect(check('notRegex', 'xyz', /^abc$/)).toBe(true);
    expect(check('is', 'ABC', '^abc$', 'i')).toBe(true);
    expect(check('not', 'xyz', '^abc$')).toBe(true);
  });

  it('negates contains and treats non-string or empty elements as not contained', () => {
    expect(check('notContains', 'hello', 'ell')).toBe(false);
    expect(check('notContains', 'hello', 'xyz')).toBe(true);
    expect(check('contains', 'hello', '')).toBe(false);
    expect(check('contains', 'hello', 5)).toBe(false);
  });

  it('checks emptiness, dates and the len default minimum', () => {
    expect(check('isNull', '')).toBe(true);
    expect(check('isNull', 'x')).toBe(false);
    expect(check('isDate', '2024-01-31')).toBe(true);
    expect(check('isDate', 'yesterday-ish')).toBe(false);
    expect(check('len', 'abcdef', undefined)).toBe(true);
    expect(check('len', '', undefined)).toBe(true);
    expect(check('isDecimal', '')).toBe(false);
    expect(check('min', '5', 5)).toBe(true);
    expect(check('max', '7', 6)).toBe(false);
  });
});
