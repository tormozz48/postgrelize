import type {
  Aggregate,
  ArraySlice,
  GroupingClause,
} from '../expressions/aggregate-expressions.ts';
import type { ExprNode } from '../sql/ast.ts';
import { inlineLiteral, type ExprConverter } from './where-support.ts';
import type { WindowCompiler } from './window-compiler.ts';

/** Compiles ordered aggregates, array slices and `ROLLUP` / `CUBE` / `GROUPING SETS`. */
export class AggregateCompiler {
  readonly #windows: WindowCompiler;

  /**
   * @param windows - Resolves attribute names and `ORDER BY` items.
   */
  constructor(windows: WindowCompiler) {
    this.#windows = windows;
  }

  /** `name([DISTINCT] args [ORDER BY ...])`. */
  aggregate(compiler: ExprConverter, value: Aggregate): ExprNode {
    const { distinct, orderBy = [] } = value.options;
    const args = value.args.map((arg) => this.#windows.target(compiler, arg));
    return {
      kind: 'fn',
      name: value.name,
      args: value.separator === undefined ? args : [...args, inlineLiteral(value.separator)],
      ...(distinct === true ? { distinct: true } : {}),
      ...(orderBy.length === 0
        ? {}
        : { orderBy: orderBy.map((item) => this.#windows.orderItem(compiler, item)) }),
    };
  }

  /** `(array)[from:to]`. */
  slice(compiler: ExprConverter, value: ArraySlice): ExprNode {
    return {
      kind: 'slice',
      expr: this.#windows.target(compiler, value.array),
      ...(value.from === undefined ? {} : { from: value.from }),
      ...(value.to === undefined ? {} : { to: value.to }),
    };
  }

  /** `ROLLUP (...)`, `CUBE (...)` or `GROUPING SETS (...)`. */
  clause(compiler: ExprConverter, value: GroupingClause): ExprNode {
    return {
      kind: 'grouping',
      type: value.type,
      items: value.items.map((item) => this.#item(compiler, item, value.type)),
    };
  }

  // only GROUPING SETS has the empty set `()`
  #item(compiler: ExprConverter, item: unknown, type: GroupingClause['type']): ExprNode {
    if (!Array.isArray(item)) {
      return this.#windows.target(compiler, item);
    }
    if (item.length === 0 && type !== 'GROUPING SETS') {
      throw new Error(`${type} cannot hold an empty list`);
    }
    return {
      kind: 'list',
      items: item.map((entry: unknown) => this.#windows.target(compiler, entry)),
    };
  }
}
