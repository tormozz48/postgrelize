import type {
  FromItem,
  JoinNode,
  LockNode,
  QueryNode,
  SelectNode,
  SetOperationNode,
} from './ast.ts';
import { WithCompiler, type CteBodyCompiler } from './with-compiler.ts';
import { FromCompiler } from './from-compiler.ts';
import { ExpressionCompiler } from './expression-compiler.ts';
import { ChunkBuilder, type Chunks } from './sql-chunks.ts';

/** Compiles SELECT statements with their FROM, JOIN, WITH and locking clauses. */
export class QueryCompiler extends ChunkBuilder {
  /** Expression compiler that compiles subqueries through this compiler. */
  readonly expr: ExpressionCompiler;
  readonly #sources: FromCompiler;
  readonly #with: WithCompiler;
  #modifying: CteBodyCompiler = (node) => this.unexpected(node as never);
  readonly #fromItem = (from: FromItem): Chunks => this.from(from);
  readonly #joinClause = (node: JoinNode): Chunks => this.#join(node);

  constructor() {
    super();
    this.expr = new ExpressionCompiler(this);
    this.#sources = new FromCompiler(this.expr);
    this.#with = new WithCompiler((node) => this.#cteBody(node));
  }

  /**
   * Compiles a SELECT statement.
   *
   * @param node - SELECT node.
   * @returns Chunks.
   */
  select(node: SelectNode): Chunks {
    return [...this.#selectHead(node), ...this.#selectTail(node)];
  }

  /**
   * Compiles a query expression: a SELECT or a set operation.
   *
   * @param node - Query node.
   * @returns Chunks.
   */
  query(node: QueryNode): Chunks {
    return node.kind === 'setop' ? this.#setOperation(node) : this.select(node);
  }

  /**
   * Sets the compiler of data-modifying CTE bodies (which live in the DML compiler).
   *
   * @param compile - Compiler of INSERT / UPDATE / DELETE statements.
   */
  useModifying(compile: CteBodyCompiler): void {
    this.#modifying = compile;
  }

  /**
   * One FROM source: a table or an aliased subquery.
   *
   * @param from - FROM source.
   * @returns Chunks.
   */
  from(from: FromItem): Chunks {
    if ('subquery' in from) {
      return [
        from.lateral === true ? 'LATERAL ' : '',
        ...this.wrap(this.query(from.subquery)),
        ` AS ${this.quote(from.alias)}`,
      ];
    }
    if ('values' in from) {
      return this.#sources.values(from);
    }
    if ('function' in from) {
      return this.#sources.function(from);
    }
    return 'jsonTable' in from ? this.#sources.jsonTable(from) : this.#sources.table(from);
  }

  /**
   * Comma-separated FROM sources.
   *
   * @param items - FROM sources.
   * @returns Chunks.
   */
  fromList(items: readonly FromItem[]): Chunks {
    return this.joinAll(items.map(this.#fromItem), ', ');
  }

  #selectHead(node: SelectNode): Chunks {
    const distinctOn = node.distinctOn ?? [];
    return [
      ...(node.with === undefined ? [] : this.#with.with(node.with)),
      node.distinct === true || distinctOn.length > 0 ? 'SELECT DISTINCT ' : 'SELECT ',
      ...(distinctOn.length === 0
        ? []
        : ['ON ', ...this.wrap(this.expr.exprList(distinctOn)), ' ']),
      ...this.expr.exprList(node.columns),
      ' FROM ',
      ...this.from(node.from),
      ...(node.joins ?? []).flatMap(this.#joinClause),
      ...(node.extraFrom ?? []).flatMap((item) => [', ', ...this.from(item)]),
    ];
  }

  #selectTail(node: SelectNode): Chunks {
    return [
      ...this.expr.where(node.where),
      ...(node.groupBy === undefined || node.groupBy.length === 0
        ? []
        : [' GROUP BY ', ...this.expr.exprList(node.groupBy)]),
      ...(node.having === undefined ? [] : [' HAVING ', ...this.expr.expression(node.having)]),
      ...(node.orderBy === undefined || node.orderBy.length === 0
        ? []
        : [' ORDER BY ', ...this.expr.orderList(node.orderBy)]),
      ...(node.limit === undefined || node.withTies === true
        ? []
        : [' LIMIT ', { param: node.limit }]),
      ...(node.offset === undefined ? [] : [' OFFSET ', { param: node.offset }]),
      ...(node.limit === undefined || node.withTies !== true
        ? []
        : [' FETCH FIRST ', { param: node.limit }, ' ROWS WITH TIES']),
      ...(node.lock === undefined ? [] : [this.#lock(node.lock)]),
    ];
  }

  #join(node: JoinNode): Chunks {
    return [
      ` ${node.type} JOIN `,
      ...this.from(node.table),
      ' ON ',
      ...this.expr.expression(node.on),
    ];
  }

  #lock(node: LockNode): string {
    return [
      ` FOR ${node.strength}`,
      node.of === undefined || node.of.length === 0
        ? ''
        : ` OF ${node.of.map(this.quote).join(', ')}`,
      node.wait === undefined ? '' : ` ${node.wait}`,
    ].join('');
  }

  #setOperation(node: SetOperationNode): Chunks {
    return [
      ...this.#operand(node.left),
      ` ${node.op}${node.all ? ' ALL' : ''} `,
      ...this.#operand(node.right),
    ];
  }

  // Parentheses only where the grammar needs them, so plain operands keep their text.
  #operand(node: QueryNode): Chunks {
    const needsParens =
      node.kind === 'setop' ||
      (node.orderBy?.length ?? 0) > 0 ||
      node.limit !== undefined ||
      node.offset !== undefined ||
      node.lock !== undefined ||
      node.with !== undefined;
    return needsParens ? this.wrap(this.query(node)) : this.select(node);
  }

  #cteBody(node: Parameters<CteBodyCompiler>[0]): Chunks {
    return node.kind === 'select' || node.kind === 'setop'
      ? this.query(node)
      : this.#modifying(node);
  }
}
