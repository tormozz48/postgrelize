import type { Subquery } from '../expressions/methods.ts';
import type { CteNode, FromItem, WithClause } from '../sql/ast.ts';
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
  /** Non-recursive part. */
  query: Subquery;
  /** Recursive part (makes the whole clause `WITH RECURSIVE`); reference the CTE through `from`. */
  recursive?: Subquery;
  /** `UNION ALL` (default) or `UNION` between `query` and `recursive`. */
  unionAll?: boolean;
  /** `MATERIALIZED` / `NOT MATERIALIZED` hint. */
  materialized?: boolean;
}>;

/** `with` option: CTEs by name. */
export type WithOption = Readonly<Record<string, Subquery | CteDefinition>>;

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
  /** Read model rows from this relation (usually a CTE name) instead of the model table. */
  source?: string;
  /** Extra relations (`FROM "Model", "alias"`), keyed by alias; correlate them in `where`. */
  from?: JoinSources;
}>;

const isDefinition = (value: Subquery | CteDefinition): value is CteDefinition => 'query' in value;

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
  sourceDefinition(definition: ModelDefinition, source: string | undefined): ModelDefinition {
    return source === undefined
      ? definition
      : new ModelDefinition({
          ...definition,
          tableName: source,
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
  selectOptions(
    options: CteFindOptions,
  ): Readonly<{ withClause?: WithClause; extraFrom?: readonly FromItem[] }> {
    const withClause = this.withClause(options.with);
    const extraFrom = this.#joins.build(options.from);
    return {
      ...(withClause === undefined ? {} : { withClause }),
      ...(extraFrom.length === 0 ? {} : { extraFrom }),
    };
  }

  static #cte(name: string, value: Subquery | CteDefinition): CteNode {
    const cte: CteDefinition = isDefinition(value) ? value : { query: value };
    const base = cte.query.build();
    return {
      name,
      query:
        cte.recursive === undefined
          ? base
          : {
              kind: 'union' as const,
              left: base,
              right: cte.recursive.build(),
              all: cte.unionAll !== false,
            },
      ...(cte.materialized === undefined ? {} : { materialized: cte.materialized }),
    };
  }
}
