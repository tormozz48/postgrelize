import { describe, expect, it } from 'vitest';
import { HookRegistry } from '../../../src/hooks/hooks.ts';

describe('hook registry', () => {
  it('proxies beforeSave to create and update hooks and removes by name or function', async () => {
    const calls: string[] = [];
    const fn = () => void calls.push('fn');
    const registry = HookRegistry.EMPTY.add('beforeSave', fn).add(
      'beforeCreate',
      () => void calls.push('named'),
      'n',
    );
    expect(registry.has('beforeUpdate')).toBe(true);
    await HookRegistry.runAll([registry], 'beforeCreate', undefined);
    expect(calls).toEqual(['fn', 'named']);
    const removed = registry.remove('beforeCreate', 'n').remove('beforeSave', fn);
    expect(removed.has('beforeCreate')).toBe(false);
    expect(registry.has('beforeCreate')).toBe(true);
  });

  it('builds registries from options, runs registries in order, rejects unknown types', async () => {
    const calls: string[] = [];
    const model = HookRegistry.fromOption({
      afterFind: [() => void calls.push('m1'), () => void calls.push('m2')],
    });
    const global = HookRegistry.fromOption({ afterFind: () => void calls.push('g') });
    await HookRegistry.runAll([model, global], 'afterFind', undefined);
    expect(calls).toEqual(['m1', 'm2', 'g']);
    expect(() => HookRegistry.EMPTY.add('beforeNothing', () => undefined)).toThrow(
      /not a valid hook type/,
    );
  });
});
