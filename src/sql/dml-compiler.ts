import type {
  ConflictTarget,
  DeleteNode,
  ExprNode,
  InsertNode,
  OnConflictNode,
  SetItem,
  TruncateNode,
  UpdateNode,
} from './ast.ts';
import type { ExpressionCompiler } from './expression-compiler.ts';
import type { QueryCompiler } from './query-compiler.ts';
import { ChunkBuilder, type Chunks } from './sql-chunks.ts';

/** Compiles INSERT, UPDATE, DELETE and TRUNCATE statements and their shared clauses. */
export class DmlCompiler extends ChunkBuilder {
  readonly #query: QueryCompiler;
  readonly #expr: ExpressionCompiler;
  readonly #setItem = (item: SetItem): Chunks => [
    `${this.quote(item.column)} = `,
    ...this.#expr.expression(item.value),
  ];

  /**
   * @param query - SELECT compiler; its expression compiler is shared.
   */
  constructor(query: QueryCompiler) {
    super();
    this.#query = query;
    this.#expr = query.expr;
  }

  /**
   * Compiles an INSERT statement.
   *
   * @param node - INSERT node.
   * @returns Chunks.
   */
  insert(node: InsertNode): Chunks {
    return [
      'INSERT INTO ',
      ...this.tableRef(node.table),
      ...this.#insertValues(node),
      ...(node.onConflict === undefined ? [] : this.#onConflict(node.onConflict)),
      ...this.returning(node.returning, node.returningOld),
    ];
  }

  /**
   * Compiles an UPDATE statement.
   *
   * @param node - UPDATE node.
   * @returns Chunks.
   */
  update(node: UpdateNode): Chunks {
    return [
      'UPDATE ',
      ...this.tableRef(node.table),
      ' SET ',
      ...this.setList(node.set),
      ...(node.from === undefined || node.from.length === 0
        ? []
        : [' FROM ', ...this.#query.fromList(node.from)]),
      ...this.#expr.where(node.where),
      ...this.returning(node.returning, node.returningOld),
    ];
  }

  /**
   * Compiles a DELETE statement.
   *
   * @param node - DELETE node.
   * @returns Chunks.
   */
  delete(node: DeleteNode): Chunks {
    return [
      'DELETE FROM ',
      ...this.tableRef(node.table),
      ...(node.using === undefined || node.using.length === 0
        ? []
        : [' USING ', ...this.#query.fromList(node.using)]),
      ...this.#expr.where(node.where),
      ...this.returning(node.returning),
    ];
  }

  /**
   * Compiles a TRUNCATE statement.
   *
   * @param node - TRUNCATE node.
   * @returns Chunks.
   */
  truncate(node: TruncateNode): Chunks {
    return [
      'TRUNCATE ',
      ...this.tableRef(node.table),
      node.restartIdentity === true ? ' RESTART IDENTITY' : '',
      node.cascade === true ? ' CASCADE' : '',
    ];
  }

  /**
   * Comma-separated `"column" = value` items.
   *
   * @param items - SET items.
   * @returns Chunks.
   */
  setList(items: readonly SetItem[]): Chunks {
    return this.joinAll(items.map(this.#setItem), ', ');
  }

  /**
   * Optional RETURNING clause.
   *
   * @param items - Returned expressions.
   * @param oldAlias - Alias of the pre-statement row (`WITH (OLD AS ...)`).
   * @returns Chunks, or nothing.
   */
  returning(items: readonly ExprNode[] | undefined, oldAlias?: string): Chunks {
    return items === undefined || items.length === 0
      ? []
      : [
          ' RETURNING ',
          oldAlias === undefined ? '' : `WITH (OLD AS ${this.quote(oldAlias)}) `,
          ...this.#expr.exprList(items),
        ];
  }

  #insertValues(node: InsertNode): Chunks {
    return node.select !== undefined
      ? [' ', ...this.columnList(node.columns), ' ', ...this.#query.select(node.select)]
      : node.columns.length === 0
        ? [' DEFAULT VALUES']
        : [
            ' ',
            ...this.columnList(node.columns),
            node.overriding === undefined
              ? ''
              : ` OVERRIDING ${node.overriding === 'system' ? 'SYSTEM' : 'USER'} VALUE`,
            ' VALUES ',
            ...this.#expr.rows(node.rows),
          ];
  }

  #conflictTarget(target: ConflictTarget): Chunks {
    return target.kind === 'constraint'
      ? [` ON CONSTRAINT ${this.quote(target.name)}`]
      : [' ', ...this.wrap(this.#expr.exprList(target.items)), ...this.#expr.where(target.where)];
  }

  #onConflict(node: OnConflictNode): Chunks {
    return [
      ' ON CONFLICT',
      ...(node.target === undefined ? [] : this.#conflictTarget(node.target)),
      ...(node.action.kind === 'nothing'
        ? [' DO NOTHING']
        : [
            ' DO UPDATE SET ',
            ...this.setList(node.action.set),
            ...this.#expr.where(node.action.where),
          ]),
    ];
  }
}
