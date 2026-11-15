import type { CteCycle, CteNode, CteSearch, ModifyingNode, QueryNode, WithClause } from './ast.ts';
import { ChunkBuilder, type Chunks } from './sql-chunks.ts';

/** Compiles a CTE body: a query, or a data-modifying statement. */
export type CteBodyCompiler = (node: QueryNode | ModifyingNode) => Chunks;

/** Compiles `WITH [RECURSIVE]` clauses with `MATERIALIZED`, `SEARCH` and `CYCLE`. */
export class WithCompiler extends ChunkBuilder {
  readonly #body: CteBodyCompiler;

  /**
   * @param body - Compiler of CTE bodies.
   */
  constructor(body: CteBodyCompiler) {
    super();
    this.#body = body;
  }

  /**
   * Compiles a WITH clause.
   *
   * @param clause - WITH clause.
   * @returns `WITH ... ` including the trailing space.
   */
  with(clause: WithClause): Chunks {
    return [
      clause.recursive ? 'WITH RECURSIVE ' : 'WITH ',
      ...this.joinAll(
        clause.ctes.map((cte) => this.#cte(cte)),
        ', ',
      ),
      ' ',
    ];
  }

  #cte(cte: CteNode): Chunks {
    return [
      `${this.quote(cte.name)} AS `,
      cte.materialized === undefined
        ? ''
        : cte.materialized
          ? 'MATERIALIZED '
          : 'NOT MATERIALIZED ',
      ...this.wrap(this.#body(cte.query)),
      this.#search(cte.search),
      this.#cycle(cte.cycle),
    ];
  }

  #search(search: CteSearch | undefined): string {
    return search === undefined
      ? ''
      : ` SEARCH ${search.mode} FIRST BY ${search.by.map(this.quote).join(', ')} SET ${this.quote(search.set)}`;
  }

  #cycle(cycle: CteCycle | undefined): string {
    return cycle === undefined
      ? ''
      : ` CYCLE ${cycle.columns.map(this.quote).join(', ')} SET ${this.quote(cycle.set)} USING ${this.quote(cycle.using)}`;
  }
}
