import { describe, expect, it } from 'vitest';
import type * as Expressions from '../../../src/expressions/methods.ts';
import { Fn, Literal, SqlExpression, col, literal } from '../../../src/expressions/methods.ts';

describe('expression instance checks', () => {
  it('recognise expressions built by another copy of the package', async () => {
    const secondCopy = new URL('../../../src/expressions/methods.ts?second-copy', import.meta.url);
    const copy = (await import(/* @vite-ignore */ secondCopy.href)) as typeof Expressions;
    expect(copy.Literal).not.toBe(Literal);
    const foreign = copy.literal('NOW()');
    expect(foreign instanceof SqlExpression).toBe(true);
    expect(foreign instanceof Literal).toBe(true);
    expect(foreign instanceof Fn).toBe(false);
    expect(literal('x') instanceof copy.SqlExpression).toBe(true);
  });

  it('distinguishes expression kinds and plain values', () => {
    expect(col('a') instanceof Literal).toBe(false);
    expect({ val: 'x' } instanceof SqlExpression).toBe(false);
    expect((null as unknown) instanceof SqlExpression).toBe(false);
  });
});
