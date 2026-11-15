import type { InsertNode } from '../sql/ast.ts';
import type { CompiledQuery, SqlCompiler } from '../sql/compile.ts';
import type { InsertQueryBuilder } from './insert-query-builder.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { BulkCreateOptions } from './options.ts';

const SOURCE_NAME = '__pgz_unnest__';

type Column = Readonly<{ type: string; cells: readonly unknown[] }>;

/**
 * Builds `INSERT INTO t (cols) SELECT * FROM unnest($1::type[], …)` for `bulkCreate({ unnest: true })`:
 * one array parameter per column, so the 65535-parameter limit does not cap the batch size.
 */
export class UnnestInsertBuilder {
  readonly #inserts: InsertQueryBuilder;
  readonly #compiler: SqlCompiler;

  /**
   * @param inserts - VALUES INSERT builder, reused for columns, table and RETURNING.
   * @param compiler - SQL compiler.
   */
  constructor(inserts: InsertQueryBuilder, compiler: SqlCompiler) {
    this.#inserts = inserts;
    this.#compiler = compiler;
  }

  /**
   * @param definition - Model definition.
   * @param rows - Values by attribute name.
   * @param options - `returning` and `overriding` of the bulk create.
   * @returns The compiled INSERT; its values are the column arrays.
   * @throws Error for conflict options, `ARRAY` columns, or rows that leave a column to its default.
   */
  build(
    definition: ModelDefinition,
    rows: readonly Readonly<Record<string, unknown>>[],
    options: BulkCreateOptions,
  ): CompiledQuery {
    UnnestInsertBuilder.#assertSupported(options);
    const node = this.#inserts.build(definition, rows, {
      returning: options.returning !== false,
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
    });
    const columns = UnnestInsertBuilder.#columns(definition, node);
    const source = columns.map(({ type }, index) => `$${index + 1}::${type}[]`).join(', ');
    return {
      text: this.#compile(node).replace(`"${SOURCE_NAME}"`, `unnest(${source})`),
      values: columns.map(({ cells }) => cells),
    };
  }

  // The AST has no function in FROM yet: the source is a placeholder table swapped after compiling.
  #compile(node: InsertNode): string {
    return this.#compiler.compile({
      ...node,
      rows: [],
      select: { kind: 'select', columns: [{ kind: 'raw', sql: '*' }], from: { name: SOURCE_NAME } },
    }).text;
  }

  static #assertSupported(options: BulkCreateOptions): void {
    if (
      options.onConflict !== undefined ||
      options.ignoreDuplicates === true ||
      options.updateOnDuplicate !== undefined
    ) {
      throw new Error('bulkCreate unnest cannot be combined with conflict options');
    }
  }

  static #columns(definition: ModelDefinition, node: InsertNode): readonly Column[] {
    return node.columns.map((field, index) => {
      const attribute = [...definition.attributes.values()].find((item) => item.field === field);
      if (attribute === undefined || attribute.type.key === 'ARRAY') {
        throw new Error(`bulkCreate unnest does not support column "${field}"`);
      }
      const cells = node.rows.map((row) => {
        const cell = row[index];
        if (cell?.kind !== 'param') {
          throw new Error(`bulkCreate unnest needs a value for "${field}" in every row`);
        }
        return cell.value;
      });
      return { type: attribute.type.sqlType, cells };
    });
  }
}
