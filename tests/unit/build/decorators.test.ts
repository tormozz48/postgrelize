import { describe, expect, it } from 'vitest';

const calls: string[] = [];

const traced = <T extends (this: unknown, ...args: never[]) => unknown>(
  method: T,
  context: ClassMethodDecoratorContext,
): T =>
  function (this: unknown, ...args: never[]) {
    calls.push(String(context.name));
    return method.apply(this, args);
  } as T;

const named =
  (name: string) =>
  <T extends abstract new (...args: never[]) => unknown>(
    target: T,
    _context: ClassDecoratorContext,
  ): T => {
    Object.defineProperty(target, 'label', { value: name });
    return target;
  };

@named('counter')
class Counter {
  static readonly #step = 2;
  static readonly start = Counter.#step * 10;

  #count = Counter.start;

  @traced
  next(): number {
    this.#count += Counter.#step;
    return this.#count;
  }
}

describe('TC39 decorators (build/decorators-plugin.ts)', () => {
  it('lowers class and method decorators, keeping private and static members working', () => {
    const counter = new Counter();
    expect([counter.next(), counter.next()]).toEqual([22, 24]);
    expect(calls).toEqual(['next', 'next']);
    expect((Counter as unknown as { label: string }).label).toBe('counter');
  });
});
