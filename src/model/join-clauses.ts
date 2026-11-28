import { SqlAst, type JoinNode } from '../sql/ast.ts';
import type { WhereCompiler } from '../where/where.ts';
import type { PendingJoin } from './join-source-builder.ts';

const ast = new SqlAst();

/** Compiles the conditions of the `joins` option; a join without one is `ON true`. */
export class JoinClauses {
  /**
   * @param joins - Pending joins.
   * @param ctx - Where compiler of the outer query.
   * @returns Join nodes.
   */
  build(joins: readonly PendingJoin[], ctx: WhereCompiler): readonly JoinNode[] {
    return joins.map(({ type, table, on }) => ({
      type,
      table,
      on: on === undefined || on === null ? ast.raw('true') : ctx.compile(on),
    }));
  }
}
