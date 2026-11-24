import type { ModelDefinition } from '../model/model-definition.ts';
import { SqlAst, type ExprNode, type SelectNode } from '../sql/ast.ts';
import type { IncludeNode } from './include.ts';
import type { IncludeJoins } from './include-joins.ts';

const ast = new SqlAst();

const isMulti = (node: IncludeNode): boolean => node.association.isMultiAssociation;

const aliasesOf = (nodes: readonly IncludeNode[]): readonly string[] =>
  nodes.flatMap((node) => [node.alias, ...aliasesOf(node.children)]);

/** v6 `hasRequired`: the include or one of its direct (non-separate) children is required. */
export const hasRequired = (node: IncludeNode): boolean =>
  node.required || node.children.some((child) => !child.separate && child.required);

/** True when a condition references a joined include (`$Include.attr$`) as a table. */
const referencesIncludes = (
  where: ExprNode | undefined,
  includes: readonly IncludeNode[],
): boolean => {
  if (where === undefined) {
    return false;
  }
  const text = JSON.stringify(where);
  return aliasesOf(includes).some((alias) => text.includes(`"path":[${JSON.stringify(alias)},`));
};

/** Decides the v6 sub-query form of a find with includes and builds its `EXISTS` filters. */
export class IncludeSubQuery {
  readonly #joins: IncludeJoins;

  /**
   * @param joins - Builds the joins the `EXISTS` filters are made of.
   */
  constructor(joins: IncludeJoins) {
    this.#joins = joins;
  }

  /**
   * Whether `limit`/`offset` must go into a subquery of the main table (v6 rules). A top-level
   * `where` that references a joined include cannot run inside that subquery, so it disables it.
   *
   * @param includes - Joined includes.
   * @param options - Limit / offset / subQuery of the find.
   * @param where - Compiled top-level condition.
   * @returns True for the sub-query form.
   */
  needsSubQuery(
    includes: readonly IncludeNode[],
    options: Readonly<{ limit?: number | null; offset?: number | null; subQuery?: boolean }>,
    where?: ExprNode,
  ): boolean {
    return (
      options.subQuery !== false &&
      !referencesIncludes(where, includes) &&
      ((options.limit !== undefined && options.limit !== null) ||
        (options.offset !== undefined && options.offset !== null)) &&
      includes.some(
        (node) =>
          !node.separate && (isMulti(node) || node.children.some((child) => isMulti(child))),
      )
    );
  }

  /**
   * `EXISTS` condition that keeps the rows of the main table having a matching required include
   * (also of a required include nested under an optional one, v6 `subQueryFilter`).
   *
   * @param parent - Main model definition.
   * @param parentAlias - Main table alias.
   * @param node - Required include.
   * @returns Condition.
   */
  existsFilter(parent: ModelDefinition, parentAlias: string, node: IncludeNode): ExprNode {
    const joins = this.#joins.joins(parent, parentAlias, {
      ...node,
      children: node.children.filter((child) => child.required),
      required: true,
    });
    const [first, ...rest] = joins;
    if (first === undefined) {
      return ast.raw('TRUE');
    }
    const query: SelectNode = {
      kind: 'select',
      columns: [ast.raw('1')],
      from: first.table,
      ...(rest.length === 0 ? {} : { joins: rest }),
      where: first.on,
    };
    return { kind: 'prefix', op: 'EXISTS', expr: { kind: 'subquery', query } };
  }
}
