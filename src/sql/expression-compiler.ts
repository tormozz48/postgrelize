import type {
  BetweenNode,
  BinaryNode,
  CaseNode,
  ExprNode,
  FnNode,
  LogicalNode,
  OrderNode,
  OverNode,
  QueryNode,
} from './ast.ts';
import { ChunkBuilder, type Chunks } from './sql-chunks.ts';

/** Compiles SELECT statements nested in expressions (subqueries). */
export type SubqueryCompiler = Readonly<{ query(node: QueryNode): Chunks }>;

// Dispatch is split in three switches to keep each short; the last one has the `never` check.
type CompoundNode = Exclude<
  ExprNode,
  Readonly<{ kind: 'param' | 'raw' | 'ident' | 'binary' | 'and' | 'or' | 'list' }>
>;
type StructuralNode = Exclude<
  CompoundNode,
  Readonly<{ kind: 'star' | 'fn' | 'cast' | 'prefix' | 'postfix' | 'between' }>
>;

/** Compiles expression nodes, ORDER BY items and WHERE clauses into chunks. */
export class ExpressionCompiler extends ChunkBuilder {
  readonly #queries: SubqueryCompiler;
  readonly #expr = (node: ExprNode): Chunks => this.expression(node);
  readonly #orderItem = (node: OrderNode): Chunks => this.order(node);
  readonly #row = (row: readonly ExprNode[]): Chunks => this.wrap(this.exprList(row));

  /**
   * @param queries - Compiler of subqueries.
   */
  constructor(queries: SubqueryCompiler) {
    super();
    this.#queries = queries;
  }

  /**
   * Compiles an expression.
   *
   * @param node - Expression node.
   * @returns Chunks.
   */
  expression(node: ExprNode): Chunks {
    switch (node.kind) {
      case 'param':
        return [{ param: node.value }];
      case 'raw':
        return [node.sql];
      case 'ident':
        return [node.path.map(this.quote).join('.')];
      case 'binary':
        return this.#binary(node);
      case 'and':
      case 'or':
        return this.#logical(node);
      case 'list':
        return this.wrap(this.exprList(node.items));
      default:
        return this.#compound(node);
    }
  }

  /**
   * Comma-separated expressions.
   *
   * @param items - Expressions.
   * @returns `a, b`.
   */
  exprList(items: readonly ExprNode[]): Chunks {
    return this.joinAll(items.map(this.#expr), ', ');
  }

  /**
   * Comma-separated parenthesized rows.
   *
   * @param rows - Rows of expressions.
   * @returns `(a, b), (c, d)`.
   */
  rows(rows: readonly (readonly ExprNode[])[]): Chunks {
    return this.joinAll(rows.map(this.#row), ', ');
  }

  /**
   * Comma-separated ORDER BY items.
   *
   * @param items - Order items.
   * @returns `a ASC, b DESC NULLS LAST`.
   */
  orderList(items: readonly OrderNode[]): Chunks {
    return this.joinAll(items.map(this.#orderItem), ', ');
  }

  /**
   * One ORDER BY item.
   *
   * @param node - Order item.
   * @returns `expr ASC NULLS FIRST`.
   */
  order(node: OrderNode): Chunks {
    return [
      ...this.expression(node.expr),
      ...(node.direction === undefined ? [] : [` ${node.direction}`]),
      ...(node.nulls === undefined ? [] : [` NULLS ${node.nulls}`]),
    ];
  }

  /**
   * Optional WHERE clause.
   *
   * @param node - Condition.
   * @returns ` WHERE cond`, or nothing.
   */
  where(node: ExprNode | undefined): Chunks {
    return node === undefined ? [] : [' WHERE ', ...this.expression(node)];
  }

  #compound(node: CompoundNode): Chunks {
    switch (node.kind) {
      case 'star':
        return [node.table === undefined ? '*' : `${this.quote(node.table)}.*`];
      case 'fn':
        return this.#fn(node);
      case 'cast':
        return ['CAST(', ...this.expression(node.expr), ` AS ${node.type})`];
      case 'prefix':
        return [`${node.op} `, ...this.expression(node.expr)];
      case 'postfix':
        return [...this.expression(node.expr), ` ${node.op}`];
      case 'between':
        return this.#between(node);
      default:
        return this.#structural(node);
    }
  }

  #structural(node: StructuralNode): Chunks {
    switch (node.kind) {
      case 'excluded':
        return [`EXCLUDED.${this.quote(node.column)}`];
      case 'subquery':
        return this.wrap(this.#queries.query(node.query));
      case 'alias':
        return [...this.expression(node.expr), ` AS ${this.quote(node.alias)}`];
      case 'over':
        return this.#over(node);
      case 'case':
        return this.#case(node);
      case 'values':
        return ['VALUES ', ...this.rows(node.rows)];
      default:
        return this.unexpected(node);
    }
  }

  #binary(node: BinaryNode): Chunks {
    return [...this.expression(node.left), ` ${node.op} `, ...this.expression(node.right)];
  }

  #logical(node: LogicalNode): Chunks {
    return node.items.length === 0
      ? [node.kind === 'and' ? 'TRUE' : 'FALSE']
      : node.items.length === 1 && node.items[0] !== undefined
        ? this.expression(node.items[0])
        : this.wrap(this.joinAll(node.items.map(this.#expr), ` ${node.kind.toUpperCase()} `));
  }

  #fn(node: FnNode): Chunks {
    return [
      `${node.name}(`,
      ...(node.distinct === true ? ['DISTINCT '] : []),
      ...this.exprList(node.args),
      ')',
    ];
  }

  #between(node: BetweenNode): Chunks {
    return [
      ...this.expression(node.expr),
      node.negated ? ' NOT BETWEEN ' : ' BETWEEN ',
      ...this.expression(node.low),
      ' AND ',
      ...this.expression(node.high),
    ];
  }

  #case(node: CaseNode): Chunks {
    return [
      'CASE',
      ...node.branches.flatMap((branch) => [
        ' WHEN ',
        ...this.expression(branch.when),
        ' THEN ',
        ...this.expression(branch.result),
      ]),
      ...(node.otherwise === undefined ? [] : [' ELSE ', ...this.expression(node.otherwise)]),
      ' END',
    ];
  }

  #over(node: OverNode): Chunks {
    return [...this.expression(node.expr), ' OVER (', ...this.#window(node), ')'];
  }

  #window(node: OverNode): Chunks {
    return this.joinAll(
      [
        ...(node.partitionBy.length === 0
          ? []
          : [['PARTITION BY ', ...this.exprList(node.partitionBy)]]),
        ...(node.orderBy.length === 0 ? [] : [['ORDER BY ', ...this.orderList(node.orderBy)]]),
      ],
      ' ',
    );
  }
}
