import type { Over } from '../expressions/methods.ts';
import type { ExprNode, OrderNode } from '../sql/ast.ts';
import { OrderDirection } from '../sql/order.ts';
import type { OperandResolver } from './operand-resolver.ts';
import type { ExprConverter } from './where-support.ts';

/** Compiles window function calls (`over()`): `PARTITION BY` and `ORDER BY` items. */
export class WindowCompiler {
  readonly #operands: OperandResolver;

  /**
   * @param operands - Resolves attribute names.
   */
  constructor(operands: OperandResolver) {
    this.#operands = operands;
  }

  /** `fn OVER (PARTITION BY ... ORDER BY ...)`. */
  over(compiler: ExprConverter, value: Over): ExprNode {
    return {
      kind: 'over',
      expr: compiler.toExpr(value.fn),
      partitionBy: value.partitionBy.map((item) => this.target(compiler, item)),
      orderBy: value.orderBy.map((item) => this.orderItem(compiler, item)),
    };
  }

  /** Attribute name or expression. */
  target(compiler: ExprConverter, item: unknown): ExprNode {
    return typeof item === 'string'
      ? this.#operands.operand(compiler.context, item).node
      : compiler.toExpr(item);
  }

  /** Attribute name, `[attribute, direction]` or expression of an `ORDER BY`. */
  orderItem(compiler: ExprConverter, item: unknown): OrderNode {
    if (Array.isArray(item)) {
      const [target, direction]: readonly unknown[] = item;
      return {
        expr: this.target(compiler, target),
        ...(direction === undefined ? {} : OrderDirection.parse(direction)),
      };
    }
    return { expr: this.target(compiler, item) };
  }
}
