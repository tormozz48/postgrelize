import { describe, expect, it } from 'vitest';
import { builtinValidator } from '../../../src/validation/validators.ts';

const check = (name: string, value: string, ...args: unknown[]) =>
  builtinValidator(name)?.(value, ...args);

describe('built-in validators', () => {
  it('provides validator.js functions and Sequelize v6 extras', () => {
    expect(check('isEmail', 'a@b.io')).toBe(true);
    expect(check('isEmail', 'nope')).toBe(false);
    expect(check('isUUID', '0a5e2c8e-9c1e-4c3b-8f6a-2b3c4d5e6f70', 4)).toBe(true);
    expect(check('len', 'abc', 2, 3)).toBe(true);
    expect(check('len', 'abcd', 2, 3)).toBe(false);
    expect(check('notEmpty', '  ')).toBe(false);
    expect(check('is', 'abc', /^a/)).toBe(true);
    expect(check('not', 'abc', '^a')).toBe(false);
    expect(check('min', '5', 6)).toBe(false);
    expect(check('max', 'n/a', 6)).toBe(true);
    expect(check('notIn', 'a', ['a', 'b'])).toBe(false);
    expect(check('isDecimal', '1.5e3')).toBe(true);
    expect(check('contains', 'hello', 'ell')).toBe(true);
    expect(builtinValidator('noSuchValidator')).toBeUndefined();
  });
});
