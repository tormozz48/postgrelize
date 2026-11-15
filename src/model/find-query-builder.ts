import type { IncludeNode } from '../associations/include.ts';
import type { IncludeQueryBuilder } from '../associations/include-query-builder.ts';
import type { SelectNode } from '../sql/ast.ts';
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
    const base = this.#selects.build(
      this.#cte.sourceDefinition(definition, query.source),
      {
        ...(includes.length === 0 ? query : { ...query, order: undefined }),
        ...this.#cte.selectOptions(query),
      } as SelectOptions,
      inAsAnyThreshold,
      undefined,
      alias,
    );
    return includes.length === 0 ? base : this.#includes.build(definition, base, includes, query);
  }
}
