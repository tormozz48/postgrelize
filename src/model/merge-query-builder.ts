import { SqlAst, type ExprNode, type MergeNode } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import { MergeActionBuilder } from './merge-action-builder.ts';
import type { MergeOptions } from './merge-options.ts';
import { MergeSourceBuilder } from './merge-source-builder.ts';
import type { ModelDefinition } from './model-definition.ts';

export type { MergeInsertAction, MergeMatchedAction, MergeOptions } from './merge-options.ts';

const ast = new SqlAst();

/**
 * Builds `MERGE INTO ... USING ...` statements of `Model.merge`: a VALUES or subquery source, the
 * join condition, `WHEN [NOT] MATCHED [BY SOURCE]` actions with timestamps, and RETURNING with
 * `merge_action()`.
 */
export class MergeQueryBuilder {
  /** Column carrying `merge_action()` in RETURNING. */
  static readonly ACTION = '__pgz_merge_action';

  readonly #columns: AttributeColumns;
  readonly #sources: MergeSourceBuilder;
  readonly #actions: MergeActionBuilder;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
    this.#sources = new MergeSourceBuilder(columns);
    this.#actions = new MergeActionBuilder(columns);
  }

  /**
   * Builds a MERGE statement for a model.
   *
   * @param definition - Model definition.
   * @param options - Source, join condition and WHEN clauses.
   * @param returning - Return written rows with the action taken.
   * @returns MERGE node.
   * @throws Error for empty sources, a missing `on` condition or no WHEN clause.
   */
  build(
    definition: ModelDefinition,
    options: MergeOptions<unknown>,
    returning: boolean,
  ): MergeNode {
    const source = this.#sources.build(definition, options.source, options.as ?? 'source');
    const on = this.#actions.on(definition, options.on);
    const when = this.#actions.whens(definition, options, source);
    return {
      kind: 'merge',
      table: this.#columns.table(definition, definition.name),
      source,
      on,
      when,
      ...(returning ? { returning: this.#returning(definition) } : {}),
    };
  }

  #returning(definition: ModelDefinition): readonly ExprNode[] {
    return [
      {
        kind: 'alias',
        expr: ast.fnCall('merge_action', []),
        alias: MergeQueryBuilder.ACTION,
      } as const,
      ...this.#columns.returningAll(definition, definition.name),
    ];
  }
}
