import type { MergeAction, MergeNode, MergeWhen } from './ast.ts';
import type { DmlCompiler } from './dml-compiler.ts';
import type { ExpressionCompiler } from './expression-compiler.ts';
import type { QueryCompiler } from './query-compiler.ts';
import { ChunkBuilder, type Chunks } from './sql-chunks.ts';

/** Compiles MERGE statements. */
export class MergeCompiler extends ChunkBuilder {
  readonly #query: QueryCompiler;
  readonly #expr: ExpressionCompiler;
  readonly #dml: DmlCompiler;
  readonly #whenClause = (clause: MergeWhen): Chunks => this.#when(clause);

  /**
   * @param query - SELECT compiler; its expression compiler is shared.
   * @param dml - SET and RETURNING clauses.
   */
  constructor(query: QueryCompiler, dml: DmlCompiler) {
    super();
    this.#query = query;
    this.#expr = query.expr;
    this.#dml = dml;
  }

  /**
   * Compiles a MERGE statement.
   *
   * @param node - MERGE node.
   * @returns Chunks.
   */
  merge(node: MergeNode): Chunks {
    return [
      'MERGE INTO ',
      ...this.tableRef(node.table),
      ' USING ',
      ...this.#source(node.source),
      ' ON ',
      ...this.#expr.expression(node.on),
      ...node.when.flatMap(this.#whenClause),
      ...this.#dml.returning(node.returning, node.returningOld),
    ];
  }

  #source(source: MergeNode['source']): Chunks {
    return source.kind === 'query'
      ? [...this.wrap(this.#query.select(source.query)), ` AS ${this.quote(source.alias)}`]
      : [
          ...this.wrap(['VALUES ', ...this.#expr.rows(source.rows)]),
          ` AS ${this.quote(source.alias)} `,
          ...this.columnList(source.columns),
        ];
  }

  #when(clause: MergeWhen): Chunks {
    return [
      ` WHEN ${clause.match}`,
      ...(clause.condition === undefined
        ? []
        : [' AND ', ...this.#expr.expression(clause.condition)]),
      ' THEN ',
      ...this.#action(clause.action),
    ];
  }

  #action(action: MergeAction): Chunks {
    switch (action.kind) {
      case 'update':
        return ['UPDATE SET ', ...this.#dml.setList(action.set)];
      case 'delete':
        return ['DELETE'];
      case 'nothing':
        return ['DO NOTHING'];
      case 'insert':
        return this.#insert(action);
      default:
        return this.unexpected(action);
    }
  }

  #insert(action: Extract<MergeAction, Readonly<{ kind: 'insert' }>>): Chunks {
    return action.columns.length === 0
      ? ['INSERT DEFAULT VALUES']
      : [
          'INSERT ',
          ...this.columnList(action.columns),
          ' VALUES ',
          ...this.wrap(this.#expr.exprList(action.values)),
        ];
  }
}
