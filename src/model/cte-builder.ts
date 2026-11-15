import { Subquery, WriteStatement } from '../expressions/methods.ts';
import type { CteNode, FromItem, QueryNode, SelectNode, WithClause } from '../sql/ast.ts';
import type { JoinSourceBuilder, JoinSources } from './join-source-builder.ts';
import { ModelDefinition } from './model-definition.ts';

/**
 * Common table expression of the `with` option. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const cte: CteDefinition = {
 *   query: Task.subquery({ attributes: ['id'], where: { parentId: null } }),
 *   unionAll: true,
 *   materialized: false,
 * };
 * ```
 */
export type CteDefinition = Readonly<{
  /** Non-recursive part, or a data-modifying statement with `returning` (never with `recursive`). */
  query: Subquery | WriteStatement;
  /** Recursive part (makes the whole clause `WITH RECURSIVE`); reference the CTE through `from`. */
  recursive?: Subquery;
  /** `UNION ALL` (default) or `UNION` between `query` and `recursive`. */
  unionAll?: boolean;
  /** `MATERIALIZED` / `NOT MATERIALIZED` hint. */
  materialized?: boolean;
  /** `SEARCH … FIRST BY … SET …`: adds a column that orders the rows breadth or depth first. Needs `recursive`. */
  search?: CteSearchOptions;
  /** `CYCLE … SET … [USING …]`: marks rows that revisit a key, and stops the recursion there. Needs `recursive`. */
  cycle?: CteCycleOptions;
}>;

/**
 * `search` of a recursive CTE definition.
 *
 * @example
 * ```ts
 * const search: CteSearchOptions = { by: ['id'], mode: 'breadth', set: 'ordercol' };
 * ```
 */
export type CteSearchOptions = Readonly<{
  /** Columns of the CTE that define the order. */
  by: readonly string[];
  /** Traversal order.
   * @defaultValue 'depth' */
  mode?: 'breadth' | 'depth';
  /** Name of the added ordering column. */
  set: string;
}>;

/**
 * `cycle` of a recursive CTE definition.
 *
 * @example
 * ```ts
 * const cycle: CteCycleOptions = { columns: ['id'], set: 'is_cycle', using: 'path' };
 * ```
 */
export type CteCycleOptions = Readonly<{
  /** Columns that identify a visited row. */
  columns: readonly string[];
  /** Name of the added boolean column that is true on the row that closes a cycle. */
  set: string;
  /** Name of the added array column with the path of visited keys (required: PostgreSQL 16 and 17 need it). */
  using: string;
}>;

/** `with` option: CTEs by name. */
export type WithOption = Readonly<Record<string, Subquery | WriteStatement | CteDefinition>>;

/**
 * CTE-related find options. PostgreSQL extension.
 *
 * Combined into {@link FindOptions} and {@link CountOptions}.
 *
 * @example
 * ```ts
 * const opts: CteFindOptions = {
 *   with: { recent: { query: Post.subquery({ where: { published: true } }) } },
 *   source: 'recent',
 * };
 * ```
 */
export type CteFindOptions = Readonly<{
  /** Common table expressions (`WITH [RECURSIVE] ...`). */
  with?: WithOption;
  /**
   * Read model rows from this relation instead of the model table: a CTE or table name, or a
   * subquery such as a set operation (`a.union(b)`), aliased with the model name. Columns are
   * named like the attributes.
   */
  source?: string | Subquery;
  /** Extra relations (`FROM "Model", "alias"`), keyed by alias; correlate them in `where`. */
  from?: JoinSources;
}>;

const isDefinition = (value: Subquery | WriteStatement | CteDefinition): value is CteDefinition =>
  'query' in value;

/**
 * Resolves the CTE-related find options (PostgreSQL extension): the `WITH [RECURSIVE]` clause,
 * extra FROM relations, and the definition used when rows come from a `source` relation.
 */
export class CteBuilder {
  readonly #joins: JoinSourceBuilder;

  /**
   * @param joins - Converts `from` relations into FROM items.
   */
  constructor(joins: JoinSourceBuilder) {
    this.#joins = joins;
  }

  /**
   * Builds the `WITH` clause of the `with` option.
   *
   * @param option - CTEs by name.
   * @returns WITH clause, or `undefined` without CTEs.
   */
  withClause(option: WithOption | undefined): WithClause | undefined {
    const entries = Object.entries(option ?? {});
    if (entries.length === 0) {
      return undefined;
    }
    const ctes = entries.map(([name, value]) => CteBuilder.#cte(name, value));
    return {
      recursive: entries.some(([, value]) => isDefinition(value) && value.recursive !== undefined),
      ctes,
    };
  }

  /**
   * Definition used when rows come from `source`: same attributes, columns named like attributes.
   *
   * @param definition - Model definition.
   * @param source - `source` option.
   * @returns The definition itself without `source`.
   */
  sourceDefinition(
    definition: ModelDefinition,
    source: string | Subquery | undefined,
  ): ModelDefinition {
    return source === undefined
      ? definition
      : new ModelDefinition({
          ...definition,
          tableName: typeof source === 'string' ? source : definition.tableName,
          schema: undefined,
          attributes: new Map(
            [...definition.attributes].map(([name, attribute]) => [
              name,
              { ...attribute, field: name },
            ]),
          ),
          fieldToAttribute: new Map([...definition.attributes.keys()].map((name) => [name, name])),
        });
  }

  /**
   * Resolved CTE options for the select builder.
   *
   * @param options - Find options.
   * @returns `withClause` / `extraFrom` when present.
   */
  selectOptions(options: CteFindOptions): Readonly<{
    withClause?: WithClause;
    extraFrom?: readonly FromItem[];
    fromQuery?: QueryNode;
  }> {
    const withClause = this.withClause(options.with);
    const extraFrom = this.#joins.build(options.from);
    return {
      ...(withClause === undefined ? {} : { withClause }),
      ...(extraFrom.length === 0 ? {} : { extraFrom }),
      ...(options.source instanceof Subquery ? { fromQuery: options.source.build() } : {}),
    };
  }

  /**
   * Route of a statement: `'write'` when a CTE modifies data, so it never goes to a replica.
   *
   * @param select - Built SELECT.
   * @returns `'read'` or `'write'`.
   */
  route(select: SelectNode): 'read' | 'write' {
    const modifying = select.with?.ctes.some(
      (cte) => cte.query.kind !== 'select' && cte.query.kind !== 'setop',
    );
    return modifying === true ? 'write' : 'read';
  }

  static #cte(name: string, value: Subquery | WriteStatement | CteDefinition): CteNode {
    const cte: CteDefinition = isDefinition(value) ? value : { query: value };
    return {
      name,
      query: CteBuilder.#body(name, cte),
      ...(cte.materialized === undefined ? {} : { materialized: cte.materialized }),
      ...CteBuilder.#extras(name, cte),
    };
  }

  static #body(name: string, cte: CteDefinition): CteNode['query'] {
    const base = cte.query.build();
    if (cte.query instanceof WriteStatement) {
      if (cte.recursive !== undefined) {
        throw new Error(`CTE "${name}": a data-modifying statement cannot be recursive`);
      }
      return base;
    }
    return cte.recursive === undefined
      ? base
      : {
          kind: 'setop',
          op: 'UNION',
          left: base as QueryNode,
          right: cte.recursive.build(),
          all: cte.unionAll !== false,
        };
  }

  static #extras(name: string, cte: CteDefinition): Pick<CteNode, 'search' | 'cycle'> {
    if ((cte.search !== undefined || cte.cycle !== undefined) && cte.recursive === undefined) {
      throw new Error(`CTE "${name}": search and cycle need a recursive part`);
    }
    const mode = (cte.search?.mode ?? 'depth').toUpperCase();
    if (mode !== 'DEPTH' && mode !== 'BREADTH') {
      throw new Error(`Invalid CTE search mode: ${String(cte.search?.mode)}`);
    }
    return {
      ...(cte.search === undefined
        ? {}
        : { search: { mode, by: cte.search.by, set: cte.search.set } }),
      ...(cte.cycle === undefined ? {} : { cycle: cte.cycle }),
    };
  }
}
