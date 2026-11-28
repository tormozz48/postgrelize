import { QueryError } from '../errors/errors.ts';
import type { IncludeNode } from '../associations/include.ts';
import type { IncludeQueryBuilder } from '../associations/include-query-builder.ts';
import type { SelectNode } from '../sql/ast.ts';
import { LateralKeysBuilder, type LateralKeys } from './lateral-keys-builder.ts';
import type { CteBuilder } from './cte-builder.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { FindOptions } from './options.ts';
import type { SelectOptions, SelectQueryBuilder } from './select-query-builder.ts';

/**
 * Builds the SELECT of a finder from resolved find options: the `source` / `with` / `from` CTE
 * options and the joins of includes (whose ordering is applied by the include builder).
 */
export class FindQueryBuilder {
  readonly #selects: SelectQueryBuilder;
  readonly #cte: CteBuilder;
  readonly #includes: IncludeQueryBuilder;
  readonly #laterals = new LateralKeysBuilder();

  /**
   * @param selects - SELECT builder.
   * @param cte - CTE options.
   * @param includes - Include joins.
   */
  constructor(selects: SelectQueryBuilder, cte: CteBuilder, includes: IncludeQueryBuilder) {
    this.#selects = selects;
    this.#cte = cte;
    this.#includes = includes;
  }

  /**
   * Builds the SELECT of resolved find options (scope and paranoid filter already applied).
   *
   * @param definition - Model definition.
   * @param query - Find options.
   * @param includes - Normalized include tree.
   * @param inAsAnyThreshold - Lists at least this long compile to `= ANY($n)`.
   * @param alias - Table alias instead of the model name.
   * @returns SELECT node.
   */
  build(
    definition: ModelDefinition,
    query: FindOptions,
    includes: readonly IncludeNode[],
    inAsAnyThreshold: number | undefined,
    alias?: string,
  ): SelectNode {
    if (query.lateralKeys !== undefined) {
      return this.#lateral(definition, query, inAsAnyThreshold, alias);
    }
    const tableAs = includes.length === 0 ? query.tableAs : undefined;
    const base = this.#base(
      definition,
      query,
      includes.length > 0,
      inAsAnyThreshold,
      alias ?? tableAs,
    );
    return this.#joined(definition, base, includes, query, alias ?? tableAs);
  }

  #joined(
    definition: ModelDefinition,
    base: SelectNode,
    includes: readonly IncludeNode[],
    query: FindOptions,
    alias: string | undefined,
  ): SelectNode {
    if (query.joins !== undefined && includes.some((node) => !node.separate)) {
      throw new Error('joins cannot be combined with a joined include');
    }
    return includes.length === 0
      ? FindQueryBuilder.#selecting(definition, base, alias)
      : this.#includes.build(definition, base, includes, query);
  }

  // like v6, a finder has to select something
  static #selecting(
    definition: ModelDefinition,
    select: SelectNode,
    alias: string | undefined,
  ): SelectNode {
    if (select.columns.length > 0) {
      return select;
    }
    const as = alias ?? definition.name;
    throw new QueryError(
      `Attempted a SELECT query for model '${definition.name}' as "${as}" without selecting any columns`,
    );
  }

  /**
   * Route of the built SELECT: the writer when a CTE modifies data.
   *
   * @param select - Built SELECT.
   * @returns `'read'` or `'write'`.
   */
  route(select: SelectNode): 'read' | 'write' {
    return this.#cte.route(select);
  }

  #base(
    definition: ModelDefinition,
    query: FindOptions,
    joined: boolean,
    inAsAnyThreshold: number | undefined,
    alias: string | undefined,
  ): SelectNode {
    return this.#selects.build(
      this.#cte.sourceDefinition(definition, query.source),
      {
        ...(joined ? { ...query, order: undefined } : query),
        ...this.#cte.selectOptions(query),
      } as SelectOptions,
      inAsAnyThreshold,
      undefined,
      alias,
    );
  }

  #lateral(
    definition: ModelDefinition,
    query: FindOptions,
    inAsAnyThreshold: number | undefined,
    alias: string | undefined,
  ): SelectNode {
    const name = alias ?? definition.name;
    const inner = this.#selects.build(
      definition,
      query as SelectOptions,
      inAsAnyThreshold,
      undefined,
      name,
    );
    return this.#laterals.build(definition, inner, query.lateralKeys as LateralKeys, name);
  }
}
