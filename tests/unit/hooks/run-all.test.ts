import { describe, expect, it } from 'vitest';
import { HookRegistry } from '../../../src/hooks/hooks.ts';

describe('HookRegistry.runAll', () => {
  it('resolves without running anything when no hook is registered', async () => {
    await expect(
      HookRegistry.runAll([HookRegistry.EMPTY], 'beforeFind', {}, 1),
    ).resolves.toBeUndefined();
  });

  it('runs hooks of all registries in order, one after another, with context and arguments', async () => {
    const calls: string[] = [];
    const first = HookRegistry.EMPTY.add(
      'beforeFind',
      async function slow(this: unknown, ...args: unknown[]) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        calls.push(`first:${String(args[0])}:${this === context}`);
      },
    );
    const second = HookRegistry.EMPTY.add('beforeFind', (...args: unknown[]) => {
      calls.push(`second:${String(args[0])}`);
    });
    const context = {};
    await HookRegistry.runAll([first, second], 'beforeFind', context, 7);
    expect(calls).toEqual(['first:7:true', 'second:7']);
  });

  it('rejects with the error of a hook and skips the later ones', async () => {
    const calls: string[] = [];
    const registry = HookRegistry.EMPTY.add('beforeFind', () => {
      throw new Error('boom');
    }).add('beforeFind', () => {
      calls.push('later');
    });
    await expect(HookRegistry.runAll([registry], 'beforeFind', {})).rejects.toThrow('boom');
    expect(calls).toEqual([]);
  });
});
