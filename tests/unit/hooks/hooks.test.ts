import { describe, expect, it } from 'vitest';
import {
  addHook,
  emptyHooks,
  hasHook,
  hooksFromOption,
  removeHook,
  runHooks,
} from '../../../src/hooks/hooks.ts';

describe('hook registry', () => {
  it('proxies beforeSave to create and update hooks and removes by name or function', async () => {
    const calls: string[] = [];
    const fn = () => void calls.push('fn');
    const registry = addHook(
      addHook(emptyHooks, 'beforeSave', fn),
      'beforeCreate',
      () => void calls.push('named'),
      'n',
    );
    expect(hasHook(registry, 'beforeUpdate')).toBe(true);
    await runHooks([registry], 'beforeCreate', undefined);
    expect(calls).toEqual(['fn', 'named']);
    const removed = removeHook(removeHook(registry, 'beforeCreate', 'n'), 'beforeSave', fn);
    expect(hasHook(removed, 'beforeCreate')).toBe(false);
    expect(hasHook(registry, 'beforeCreate')).toBe(true);
  });

  it('builds registries from options, runs registries in order, rejects unknown types', async () => {
    const calls: string[] = [];
    const model = hooksFromOption({
      afterFind: [() => void calls.push('m1'), () => void calls.push('m2')],
    });
    const global = hooksFromOption({ afterFind: () => void calls.push('g') });
    await runHooks([model, global], 'afterFind', undefined);
    expect(calls).toEqual(['m1', 'm2', 'g']);
    expect(() => addHook(emptyHooks, 'beforeNothing', () => undefined)).toThrow(
      /not a valid hook type/,
    );
  });
});
