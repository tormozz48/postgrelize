import type { ModelDefinition } from '../model/model-definition.ts';
import { SqlAst, type ExprNode, type JoinNode, type SelectNode } from '../sql/ast.ts';
import type { IncludeNode } from './include.ts';
import { IncludeColumns } from './include-columns.ts';
import { IncludeJoins } from './include-joins.ts';
import { IncludeOrder, type OrderNodes } from './include-order.ts';
import { exposedDefinition, hasRequired, IncludeSubQuery } from './include-sub-query.ts';

const ast = new SqlAst();

/** Options of the main query that affect the include joins. */
export type IncludeQueryOptions = Readonly<{
  /** `order` option (may reference includes). */
  order?: unknown;
  /** `limit` option. */
  limit?: number | null;
  /** `offset` option. */
  offset?: number | null;
  /** `subQuery: false` disables the sub-query form. */
  subQuery?: boolean;
}>;

type Parts = Readonly<{
  definition: ModelDefinition;
  alias: string;
  base: SelectNode;
  joined: readonly IncludeNode[];
  order: OrderNodes;
}>;

/**
 * Adds include joins, columns and ordering to a SELECT of the main model (ADR-009): decides the
 * v6 sub-query form for `limit` with multi includes, turns required includes into `EXISTS`
 * filters there, and builds the joins of `count` with includes.
 */
export class IncludeQueryBuilder {
  readonly #joins = new IncludeJoins();
  readonly #columns = new IncludeColumns();
  readonly #order = new IncludeOrder();
  readonly #subQuery = new IncludeSubQuery(this.#joins);

  /**
   * Adds joins, include columns and include ordering to a SELECT built for the main model.
   *
   * @param definition - Main model definition.
   * @param base - SELECT of the main model.
   * @param includes - Include tree.
   * @param options - Order / limit / offset / subQuery of the find.
   * @returns SELECT with the includes.
   */
  build(
    definition: ModelDefinition,
    base: SelectNode,
    includes: readonly IncludeNode[],
    options: IncludeQueryOptions,
  ): SelectNode {
    const alias = definition.name;
    const joined = includes.filter((node) => !node.separate);
    const order = this.#order.nodes(definition, joined, options.order, alias);
    const parts = { definition, alias, base, joined, order };
    return this.needsSubQuery(joined, options, base.where)
      ? this.#subQueryForm(parts, options.order)
      : {
          ...base,
          columns: [...base.columns, ...joined.flatMap((node) => this.#columns.columns(node))],
          joins: this.#joinsOf(parts),
          orderBy: order.all,
        };
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
    return this.#subQuery.needsSubQuery(includes, options, where);
  }

  /**
   * Joins for `count` with includes (no include columns).
   *
   * @param definition - Main model definition.
   * @param includes - Include tree.
   * @returns Join nodes.
   */
  countJoins(definition: ModelDefinition, includes: readonly IncludeNode[]): readonly JoinNode[] {
    return includes
      .filter((node) => !node.separate)
      .flatMap((node) => this.#joins.joins(definition, definition.name, node));
  }

  #joinsOf(parts: Parts): readonly JoinNode[] {
    return parts.joined.flatMap((node) => this.#joins.joins(parts.definition, parts.alias, node));
  }

  #innerSelect(parts: Parts): SelectNode {
    const { definition, alias, base, joined, order } = parts;
    const filters = joined
      .filter((node) => node.required || (node.association.isMultiAssociation && hasRequired(node)))
      .map((node) => this.#subQuery.existsFilter(definition, alias, node));
    const missing = this.#columns.missingKeys(definition, alias, base.columns, joined);
    return {
      ...base,
      columns: [...base.columns, ...missing],
      ...(base.where === undefined && filters.length === 0
        ? {}
        : { where: ast.and([...(base.where === undefined ? [] : [base.where]), ...filters]) }),
      orderBy: order.main,
    };
  }

  #subQueryForm(parts: Parts, order: unknown): SelectNode {
    const { alias, base, joined } = parts;
    const outer = exposedDefinition(parts.definition);
    return {
      kind: 'select',
      columns: [
        { kind: 'star', table: alias },
        ...joined.flatMap((node) => this.#columns.columns(node)),
      ],
      from: { subquery: this.#innerSelect(parts), alias },
      joins: this.#joinsOf({ ...parts, definition: outer }),
      orderBy: this.#order.nodes(outer, parts.joined, order, alias).all,
      ...(base.lock === undefined ? {} : { lock: base.lock }),
    };
  }
}
