import {
  SqlAst,
  type DeleteNode,
  type ExprNode,
  type FromItem,
  type TruncateNode,
} from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';

const ast = new SqlAst();

/** Options of {@link DeleteQueryBuilder.build}. */
export type DeleteBuildOptions = Readonly<{
  /** Return all stored columns. */
  returning?: boolean;
  /** Lists at least this long compile to `= ANY($n)`. */
  inAsAnyThreshold?: number;
  /** Delete at most this many rows (`ctid IN (SELECT ... LIMIT n)`). */
  limit?: number;
  /** Extra relations (`DELETE ... USING`); the table is then aliased with the model name. */
  using?: readonly FromItem[];
}>;

/** Builds DELETE and TRUNCATE statements of a model table. */
export class DeleteQueryBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Builds a DELETE.
   *
   * @param definition - Model definition.
   * @param where - Condition.
   * @param options - RETURNING, `= ANY` threshold, LIMIT, USING relations.
   * @returns DELETE node.
   */
  build(definition: ModelDefinition, where: unknown, options: DeleteBuildOptions = {}): DeleteNode {
    const alias =
      options.using === undefined || options.using.length === 0 ? undefined : definition.name;
    const ctx = this.#columns.whereCompiler(definition, alias, options.inAsAnyThreshold);
    const limited = this.#limited(definition, this.#columns.where(where, ctx), options.limit);
    return {
      kind: 'delete',
      table: this.#columns.table(definition, alias),
      ...(alias === undefined ? {} : { using: options.using }),
      ...(limited === undefined ? {} : { where: limited }),
      ...(options.returning === true
        ? { returning: this.#columns.returningAll(definition, alias) }
        : {}),
    };
  }

  /**
   * Builds `TRUNCATE`.
   *
   * @param definition - Model definition.
   * @param options - `cascade`, `restartIdentity`.
   * @returns TRUNCATE node.
   */
  truncate(
    definition: ModelDefinition,
    options: Readonly<{ cascade?: boolean; restartIdentity?: boolean }>,
  ): TruncateNode {
    return {
      kind: 'truncate',
      table: {
        name: definition.tableName,
        ...(definition.schema === undefined ? {} : { schema: definition.schema }),
      },
      ...(options.cascade === true ? { cascade: true } : {}),
      ...(options.restartIdentity === true ? { restartIdentity: true } : {}),
    };
  }

  #limited(
    definition: ModelDefinition,
    condition: ExprNode | undefined,
    limit: number | undefined,
  ): ExprNode | undefined {
    return limit === undefined
      ? condition
      : ast.binary('IN', ast.raw('ctid'), {
          kind: 'subquery',
          query: {
            kind: 'select',
            columns: [ast.raw('ctid')],
            from: this.#columns.table(definition),
            ...(condition === undefined ? {} : { where: condition }),
            limit,
          },
        });
  }
}
