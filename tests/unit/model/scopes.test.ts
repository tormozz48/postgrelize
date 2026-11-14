import { describe, expect, it } from 'vitest';
import { Op } from '../../../src/expressions/op.ts';
import { mergeOptions, resolveScopes, scopeRegistry } from '../../../src/model/scopes.ts';

describe('scope merging', () => {
  it('overwrites where keys, unions arrays, later values win', () => {
    expect(
      mergeOptions(
        { where: { a: 1, b: 2 }, attributes: ['x'], limit: 1 },
        { where: { b: 3 }, attributes: ['y'], limit: 5 },
      ),
    ).toEqual({ where: { a: 1, b: 3 }, attributes: ['x', 'y'], limit: 5 });
  });

  it("combines where with Op.and when strategy is 'and'", () => {
    expect(mergeOptions({ where: { a: 1 } }, { where: { a: 2 } }, 'and')).toEqual({
      where: { [Op.and]: [{ a: 1 }, { a: 2 }] },
    });
  });

  it('resolves names, functions and inline options in order', () => {
    const registry = scopeRegistry(
      { where: { d: true } },
      { s: { limit: 2 }, f: (n: number) => ({ offset: n }) },
      undefined,
    );
    expect(
      resolveScopes(registry, [
        'defaultScope',
        's',
        { method: ['f', 7] },
        { order: [['id', 'DESC']] },
      ]),
    ).toEqual({
      where: { d: true },
      limit: 2,
      offset: 7,
      order: [['id', 'DESC']],
    });
    expect(resolveScopes(registry, [null])).toEqual({});
    expect(() => resolveScopes(registry, ['missing'])).toThrow('Invalid scope missing called.');
  });
});
