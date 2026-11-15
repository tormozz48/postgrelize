// TC39 decorators reach the class through `context.metadata` (`Symbol.metadata`), which engines
// do not ship yet; it must exist before the first decorated class is evaluated.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');

/** What a decorator call decorates, independent of the decorator signature in use. */
export type DecoratorTarget = Readonly<{
  /** Object that stores the metadata: the class (legacy) or its `context.metadata` bag (TC39). */
  owner: object;
  /** Decorated member name; `undefined` for a class. */
  key: string | undefined;
  /** Whether the member is static. */
  isStatic: boolean;
}>;

type Tc39Context = Readonly<{
  kind: string;
  name?: string | symbol;
  static?: boolean;
  metadata?: object;
}>;

const isTc39Context = (value: unknown): value is Tc39Context =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { kind?: unknown }).kind === 'string';

const NO_METADATA =
  'Decorators need Symbol.metadata: import postgrelize before the decorated class is defined.';

/**
 * Tells the two decorator calling conventions apart: TC39 standard `(value, context)` and legacy
 * `experimentalDecorators` `(constructor)` / `(target, key, descriptor?)`.
 *
 * @internal
 */
export class DecoratorSignature {
  /**
   * @param args - Arguments the decorator was called with.
   * @returns The decorated class or member.
   * @throws Error when the arguments match neither convention.
   */
  resolve(args: readonly unknown[]): DecoratorTarget {
    const [first, second] = args;
    if (isTc39Context(second)) {
      return this.#standard(second);
    }
    if (typeof first === 'function') {
      return { owner: first, key: this.#name(second), isStatic: second !== undefined };
    }
    if (typeof first === 'object' && first !== null && second !== undefined) {
      return { owner: first.constructor, key: this.#name(second), isStatic: false };
    }
    throw new Error('Unsupported decorator usage.');
  }

  #standard(context: Tc39Context): DecoratorTarget {
    if (context.metadata === undefined) {
      throw new Error(NO_METADATA);
    }
    return {
      owner: context.metadata,
      key: this.#name(context.name),
      isStatic: context.static === true,
    };
  }

  #name(key: unknown): string | undefined {
    return typeof key === 'symbol' ? key.description : (key as string | undefined);
  }
}

/** @internal Shared signature adapter. */
export const signature = new DecoratorSignature();
