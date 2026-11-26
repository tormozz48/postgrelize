import { describe, expect, it } from 'vitest';
import { literal } from '../../../src/index.ts';
import { Op } from '../../../src/expressions/op.ts';
import { ScopeRegistry } from '../../../src/model/scope-registry.ts';

const registry = new ScopeRegistry(
  undefined,
  { byName: (name: string) => ({ where: { name } }) },
  undefined,
);

describe('attribute merging of scopes', () => {
  it('merges include and exclude lists of attribute objects and lets later scalars win', () => {
    expect(
      registry.merge(
        { attributes: { include: ['a'], exclude: ['x'], extra: 'old' } },
        { attributes: { include: ['b', 'a'], exclude: ['y'], extra: 'new' } },
      ),
    ).toEqual({ attributes: { include: ['a', 'b'], exclude: ['x', 'y'], extra: 'new' } });
  });

  it('keeps the left value when the right one is undefined', () => {
    expect(
      registry.merge(
        { attributes: { include: ['a'], other: 'kept' } },
        { attributes: { include: ['b'], other: undefined } },
      ),
    ).toEqual({ attributes: { include: ['a', 'b'], other: 'kept' } });
  });

  it('replaces an attribute list by an attribute object and the reverse', () => {
    expect(registry.merge({ attributes: ['a'] }, { attributes: { exclude: ['b'] } })).toEqual({
      attributes: { exclude: ['b'] },
    });
    expect(registry.merge({ attributes: { exclude: ['b'] } }, { attributes: ['a'] })).toEqual({
      attributes: ['a'],
    });
  });
});

describe('where merging with expressions', () => {
  it('adds a literal condition under Op.and next to the existing keys', () => {
    const condition = literal('1 = 1');
    expect(registry.merge({ where: { a: 1 } }, { where: condition })).toEqual({
      where: { a: 1, [Op.and]: condition },
    });
  });

  it('replaces a literal base condition by the new one', () => {
    expect(registry.merge({ where: literal('1 = 1') }, { where: { b: 2 } })).toEqual({
      where: { b: 2 },
    });
  });
});

describe('scope selection', () => {
  it('calls a function scope selected by name without arguments', () => {
    expect(registry.resolve(['byName'])).toEqual(registry.resolve([{ method: ['byName'] }]));
  });

  it('rejects a method selector for an unknown or non-function scope', () => {
    const plain = new ScopeRegistry(undefined, { fixed: { limit: 1 } }, undefined);
    expect(() => plain.resolve([{ method: ['missing'] }])).toThrow('Invalid scope missing called.');
    expect(() => plain.resolve([{ method: 'fixed' }])).toThrow('Invalid scope fixed called.');
  });

  it('calls a function scope with its arguments', () => {
    expect(registry.resolve([{ method: ['byName', 'ann'] }])).toEqual({ where: { name: 'ann' } });
  });
});

describe('option merging order and safety', () => {
  it('lists keys of the base first, then new keys of the applied options, without mutating either', () => {
    const left = { limit: 1, order: ['a'] };
    const right = { offset: 2, limit: 5 };
    const merged = registry.merge(left, right);
    expect(Object.keys(merged)).toEqual(['limit', 'order', 'offset']);
    expect(merged).toEqual({ limit: 5, order: ['a'], offset: 2 });
    expect(left).toEqual({ limit: 1, order: ['a'] });
    expect(right).toEqual({ offset: 2, limit: 5 });
  });

  it('copies options onto an empty scope and keeps a __proto__ key an own property', () => {
    const options = JSON.parse('{"__proto__": {"polluted": true}, "limit": 3}') as Record<
      string,
      unknown
    >;
    const merged = registry.merge({}, options);
    expect(Object.keys(merged)).toEqual(['__proto__', 'limit']);
    expect((merged as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
