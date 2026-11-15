import { describe, expect, it } from 'vitest';
import { Op } from '../../../src/expressions/op.ts';
import { ScopeRegistry } from '../../../src/model/scope-registry.ts';

const overwrite = new ScopeRegistry(undefined, undefined, undefined);
const and = new ScopeRegistry(undefined, undefined, 'and');

describe('scope merging', () => {
  it('overwrites where keys, unions arrays, later values win', () => {
    expect(
      overwrite.merge(
        { where: { a: 1, b: 2 }, attributes: ['x'], limit: 1 },
        { where: { b: 3 }, attributes: ['y'], limit: 5 },
      ),
    ).toEqual({ where: { a: 1, b: 3 }, attributes: ['x', 'y'], limit: 5 });
  });

  it("combines where with Op.and when strategy is 'and'", () => {
    expect(and.merge({ where: { a: 1 } }, { where: { a: 2 } })).toEqual({
      where: { [Op.and]: [{ a: 1 }, { a: 2 }] },
    });
  });

  it('resolves names, functions and inline options in order', () => {
    const registry = new ScopeRegistry(
      { where: { d: true } },
      { s: { limit: 2 }, f: (n: number) => ({ offset: n }) },
      undefined,
    );
    expect(
      registry.resolve(['defaultScope', 's', { method: ['f', 7] }, { order: [['id', 'DESC']] }]),
    ).toEqual({
      where: { d: true },
      limit: 2,
      offset: 7,
      order: [['id', 'DESC']],
    });
    expect(registry.resolve([null])).toEqual({});
    expect(() => registry.resolve(['missing'])).toThrow('Invalid scope missing called.');
  });
});
