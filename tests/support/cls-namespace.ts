import { AsyncLocalStorage } from 'node:async_hooks';

type Context = Record<string, unknown>;

/**
 * Minimal `cls-hooked`-style namespace (`run`, `bind`, `get`, `set`) built on `AsyncLocalStorage`:
 * a context inherits the values of the context it was created in and writes stay in its own context.
 */
export class TestNamespace {
  readonly #storage = new AsyncLocalStorage<Context>();

  run(callback: (context: Context) => unknown): Context {
    const context: Context = Object.create(this.#storage.getStore() ?? null);
    this.#storage.run(context, () => callback(context));
    return context;
  }

  bind<A extends unknown[], R>(fn: (...args: A) => R, context?: Context): (...args: A) => R {
    const bound = context ?? this.#storage.getStore() ?? Object.create(null);
    return (...args) => this.#storage.run(bound, () => fn(...args));
  }

  get(key: string): unknown {
    return this.#storage.getStore()?.[key];
  }

  set(key: string, value: unknown): unknown {
    const store = this.#storage.getStore();
    if (store === undefined) {
      return undefined;
    }
    store[key] = value;
    return value;
  }
}
