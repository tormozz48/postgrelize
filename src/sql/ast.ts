import type {
  BinaryNode,
  ExprNode,
  FnNode,
  IdentNode,
  LogicalNode,
  ParamNode,
  RawNode,
} from './ast-expressions.ts';

export type * from './ast-expressions.ts';
export type * from './ast-clauses.ts';
export type * from './ast-statements.ts';

/** Factories for the most common AST nodes. Stateless; nodes are plain immutable data. */
export class SqlAst {
  /** Bound parameter (`$n`). */
  param(value: unknown): ParamNode {
    return { kind: 'param', value };
  }

  /** Raw SQL text inserted as-is. */
  raw(sql: string): RawNode {
    return { kind: 'raw', sql };
  }

  /** Quoted identifier path, e.g. `"table"."column"`. */
  ident(...path: readonly string[]): IdentNode {
    return { kind: 'ident', path };
  }

  /** Binary operation `left op right`. */
  binary(op: string, left: ExprNode, right: ExprNode): BinaryNode {
    return { kind: 'binary', op, left, right };
  }

  /** Conjunction of the items (`TRUE` when empty). */
  and(items: readonly ExprNode[]): LogicalNode {
    return { kind: 'and', items };
  }

  /** Disjunction of the items (`FALSE` when empty). */
  or(items: readonly ExprNode[]): LogicalNode {
    return { kind: 'or', items };
  }

  /** Function call `name(args)`. */
  fnCall(name: string, args: readonly ExprNode[]): FnNode {
    return { kind: 'fn', name, args };
  }
}
