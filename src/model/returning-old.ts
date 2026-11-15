import { SqlAst, type ExprNode } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { RowMapper } from './row-mapper.ts';
import type { ModelRuntime } from './runtime.ts';

const ast = new SqlAst();

/**
 * `returningOld` option (PostgreSQL 18+ `RETURNING WITH (OLD AS ...)`): checks the server
 * version, adds the pre-statement row to a write's RETURNING list and reads it back.
 */
export class ReturningOld {
  /** Alias of the pre-statement row in `RETURNING WITH (OLD AS ...)`. */
  static readonly ALIAS = '__pgz_old';
  /** Prefix of returned columns carrying pre-statement values. */
  static readonly PREFIX = `${ReturningOld.ALIAS}.`;

  readonly #columns: AttributeColumns;
  readonly #rows: RowMapper;

  /**
   * @param columns - Stored columns of a model.
   * @param rows - Parses returned values.
   */
  constructor(columns: AttributeColumns, rows: RowMapper) {
    this.#columns = columns;
    this.#rows = rows;
  }

  /**
   * Whether the write should return pre-statement values.
   *
   * @param runtime - Runtime of the model (server version).
   * @param options - Write options.
   * @returns True with `returningOld: true`.
   * @throws Error on PostgreSQL older than 18.
   */
  async enabled(
    runtime: Pick<ModelRuntime, 'serverVersion'>,
    options: Readonly<{ returningOld?: boolean }>,
  ): Promise<boolean> {
    if (options.returningOld !== true) {
      return false;
    }
    if ((await runtime.serverVersion()) < 180000) {
      throw new Error('returningOld requires PostgreSQL 18 or newer');
    }
    return true;
  }

  /**
   * Adds the pre-statement row (all stored columns) to the RETURNING list of a write.
   *
   * @param definition - Model definition.
   * @param node - INSERT / UPDATE / MERGE node.
   * @returns Node with `returningOld`.
   */
  node<N extends Readonly<{ returning?: readonly ExprNode[] }>>(
    definition: ModelDefinition,
    node: N,
  ): N & Readonly<{ returningOld: string }> {
    return {
      ...node,
      returningOld: ReturningOld.ALIAS,
      returning: [
        ...(node.returning ?? []),
        ...this.#columns.stored(definition).map((attribute): ExprNode => ({
          kind: 'alias',
          expr: ast.ident(ReturningOld.ALIAS, attribute.field),
          alias: `${ReturningOld.PREFIX}${attribute.fieldName}`,
        })),
      ],
    };
  }

  /**
   * Pre-statement values of a returned row.
   *
   * @param definition - Model definition.
   * @param row - Returned row.
   * @returns Attribute values, or `null` when the row did not exist before (inserted).
   */
  previous(
    definition: ModelDefinition,
    row: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> | null {
    const old = Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key.startsWith(ReturningOld.PREFIX))
        .map(([key, value]) => [key.slice(ReturningOld.PREFIX.length), value]),
    );
    return definition.primaryKeys.every((name) => old[name] === null || old[name] === undefined)
      ? null
      : this.#rows.parse(definition, old);
  }
}
