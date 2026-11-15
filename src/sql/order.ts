import type { OrderNode } from './ast.ts';

type Direction = NonNullable<OrderNode['direction']>;
type Nulls = NonNullable<OrderNode['nulls']>;

/** Order direction (`ASC`, `DESC NULLS LAST`, ...) from an allowlist; spreads into an order node. */
export class OrderDirection {
  /** `ASC` / `DESC`; absent when only the nulls order is given. */
  declare readonly direction?: Direction;
  /** `NULLS FIRST` / `NULLS LAST`; absent when not given. */
  declare readonly nulls?: Nulls;

  static readonly #allowed: ReadonlyMap<string, OrderDirection> = new Map([
    ['ASC', new OrderDirection('ASC')],
    ['DESC', new OrderDirection('DESC')],
    ['ASC NULLS FIRST', new OrderDirection('ASC', 'FIRST')],
    ['ASC NULLS LAST', new OrderDirection('ASC', 'LAST')],
    ['DESC NULLS FIRST', new OrderDirection('DESC', 'FIRST')],
    ['DESC NULLS LAST', new OrderDirection('DESC', 'LAST')],
    ['NULLS FIRST', new OrderDirection(undefined, 'FIRST')],
    ['NULLS LAST', new OrderDirection(undefined, 'LAST')],
  ]);

  private constructor(direction?: Direction, nulls?: Nulls) {
    if (direction !== undefined) {
      this.direction = direction;
    }
    if (nulls !== undefined) {
      this.nulls = nulls;
    }
    Object.freeze(this);
  }

  /** Parses an order direction from the allowlist; throws for anything else. */
  static parse(value: unknown): OrderDirection {
    const direction = OrderDirection.#allowed.get(String(value).trim().toUpperCase());
    if (direction === undefined) {
      throw new Error(`Invalid order direction: ${String(value)}`);
    }
    return direction;
  }
}
