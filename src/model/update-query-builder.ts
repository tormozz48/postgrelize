import { SqlAst, type FromItem, type SetItem, type UpdateNode } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';

const ast = new SqlAst();

/** Options of {@link UpdateQueryBuilder.build}. */
export type UpdateBuildOptions = Readonly<{
  /** Return all stored columns. */
  returning?: boolean;
  /** Lists at least this long compile to `= ANY($n)`. */
  inAsAnyThreshold?: number;
  /** Extra relations (`UPDATE ... FROM`); the table is then aliased with the model name. */
  from?: readonly FromItem[];
}>;

/** Builds UPDATE statements and the SET items of `increment` / `decrement`. */
export class UpdateQueryBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Builds an UPDATE.
   *
   * @param definition - Model definition.
   * @param set - SET items.
   * @param where - Condition.
   * @param options - RETURNING, `= ANY` threshold, FROM relations.
   * @returns UPDATE node.
   */
  build(
    definition: ModelDefinition,
    set: readonly SetItem[],
    where: unknown,
    options: UpdateBuildOptions = {},
  ): UpdateNode {
    const alias =
      options.from === undefined || options.from.length === 0 ? undefined : definition.name;
    const condition = this.#columns.where(
      where,
      this.#columns.whereCompiler(definition, alias, options.inAsAnyThreshold),
    );
    return {
      kind: 'update',
      table: this.#columns.table(definition, alias),
      set,
      ...(alias === undefined ? {} : { from: options.from }),
      ...(condition === undefined ? {} : { where: condition }),
      ...(options.returning === true
        ? { returning: this.#columns.returningAll(definition, alias) }
        : {}),
    };
  }

  /**
   * SET items `field = field + by` (or `- by`) for increment / decrement.
   *
   * @param definition - Model definition.
   * @param by - Amount per attribute.
   * @param sign - `1` to increment, `-1` to decrement.
   * @returns SET items.
   */
  increment(
    definition: ModelDefinition,
    by: Readonly<Record<string, number>>,
    sign: 1 | -1,
  ): readonly SetItem[] {
    return Object.entries(by).map(([name, amount]) => {
      const field = definition.attributes.get(name)?.field ?? name;
      return {
        column: field,
        value: ast.binary(sign === 1 ? '+' : '-', ast.ident(field), ast.param(amount)),
      };
    });
  }
}
