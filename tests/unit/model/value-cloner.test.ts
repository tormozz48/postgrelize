import { describe, expect, it } from 'vitest';
import { ValueCloner } from '../../../src/model/value-cloner.ts';

const cloner = new ValueCloner();
const stamp = new Date('2024-01-02T03:04:05.000Z');

describe('ValueCloner', () => {
  it('copies primitives, dates, arrays and plain objects deeply', () => {
    const source = {
      id: 1,
      tags: ['a', { n: 1n }],
      at: stamp,
      meta: { deep: { list: [1, null] } },
      gone: undefined,
    };
    const copy = cloner.clone(source);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.at).not.toBe(stamp);
    expect(copy.meta.deep.list).not.toBe(source.meta.deep.list);
  });

  it('matches structuredClone on typical row values', () => {
    const source = { a: 'x', b: [1, 2, [3]], c: { d: stamp }, e: null, f: Number.NaN };
    expect(cloner.clone(source)).toEqual(structuredClone(source));
  });

  it('keeps holes of sparse arrays and null-prototype objects work', () => {
    const sparse: unknown[] = [1];
    sparse[3] = 4;
    const copy = cloner.clone({ sparse, bare: Object.assign(Object.create(null), { k: 1 }) });
    expect(copy.sparse).toHaveLength(4);
    expect(1 in copy.sparse).toBe(false);
    expect(copy.bare).toEqual({ k: 1 });
  });

  it('keeps a __proto__ key as an own property', () => {
    const source = JSON.parse('{"__proto__": {"x": 1}}') as Record<string, unknown>;
    const copy = cloner.clone(source);
    expect(Object.keys(copy)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  });

  it('falls back to structuredClone for typed arrays, maps and class instances', () => {
    const source = {
      bytes: new Uint8Array([1, 2]),
      map: new Map([[1, 2]]),
      box: new (class Box {
        v = 1;
      })(),
    };
    const copy = cloner.clone(source);
    expect(copy.bytes).toEqual(new Uint8Array([1, 2]));
    expect(copy.map).toEqual(new Map([[1, 2]]));
    expect(copy.box).toEqual({ v: 1 });
    expect(copy.box.constructor).toBe(Object);
  });

  it('preserves cycles and shared references like structuredClone', () => {
    const cycle: Record<string, unknown> = { name: 'c' };
    cycle['self'] = cycle;
    const copy = cloner.clone(cycle);
    expect(copy['self']).toBe(copy);
    const shared = { v: 1 };
    const pair = cloner.clone({ a: shared, b: shared });
    expect(pair.a).toBe(pair.b);
    expect(pair.a).not.toBe(shared);
  });

  it('falls back for very deep values and rejects functions and symbols like structuredClone', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let level = 0; level < 50; level += 1) {
      deep = { next: deep };
    }
    expect(cloner.clone(deep)).toEqual(deep);
    expect(() => cloner.clone({ fn: () => 1 })).toThrow(/could not be cloned/);
    expect(() => cloner.clone({ symbol: Symbol('s') })).toThrow(/could not be cloned/);
  });
});
