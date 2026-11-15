import type {
  FunctionSource,
  JsonTableColumn,
  JsonTableSource,
  TableRef,
  TableSample,
  ValuesSource,
} from './ast.ts';
import type { ExpressionCompiler } from './expression-compiler.ts';
import { ChunkBuilder, type Chunks } from './sql-chunks.ts';

/** Compiles the FROM sources other than tables and subqueries: VALUES, functions, JSON_TABLE, TABLESAMPLE. */
export class FromCompiler extends ChunkBuilder {
  readonly #expr: ExpressionCompiler;

  /**
   * @param expr - Expression compiler of the arguments.
   */
  constructor(expr: ExpressionCompiler) {
    super();
    this.#expr = expr;
  }

  /**
   * A table with its optional sampling clause.
   *
   * @param table - Table reference.
   * @returns Chunks.
   */
  table(table: TableRef): Chunks {
    return [...this.tableRef(table), ...this.#sample(table.sample)];
  }

  /**
   * `(VALUES ...) AS alias(columns)`.
   *
   * @param source - VALUES source.
   * @returns Chunks.
   */
  values(source: ValuesSource): Chunks {
    return [
      ...this.wrap(['VALUES ', ...this.#expr.rows(source.values)]),
      ` AS ${this.quote(source.alias)}`,
      ...this.columnList(source.columns),
    ];
  }

  /**
   * Set-returning function call.
   *
   * @param source - Function source.
   * @returns Chunks.
   */
  function(source: FunctionSource): Chunks {
    return [
      source.function.map(this.quote).join('.'),
      ...this.wrap(this.#expr.exprList(source.args)),
      source.ordinality === undefined ? '' : ' WITH ORDINALITY',
      ` AS ${this.quote(source.alias)}`,
      ...(source.columns === undefined ? [] : this.columnList(source.columns)),
    ];
  }

  /**
   * `JSON_TABLE(...)`.
   *
   * @param source - JSON_TABLE source.
   * @returns Chunks.
   */
  jsonTable(source: JsonTableSource): Chunks {
    const { doc, path, columns } = source.jsonTable;
    return [
      'JSON_TABLE(',
      ...this.#expr.expression(doc),
      `, ${path} COLUMNS (${columns.map((column) => this.#column(column)).join(', ')})) AS ${this.quote(source.alias)}`,
    ];
  }

  #column(column: JsonTableColumn): string {
    if (column.kind === 'ordinality') {
      return `${this.quote(column.name)} FOR ORDINALITY`;
    }
    const exists = column.kind === 'exists' ? ' EXISTS' : '';
    const path = column.path === undefined ? '' : ` PATH ${column.path}`;
    return `${this.quote(column.name)} ${column.type}${exists}${path}`;
  }

  #sample(sample: TableSample | undefined): Chunks {
    return sample === undefined
      ? []
      : [
          ` TABLESAMPLE ${sample.method} `,
          ...this.wrap(this.#expr.expression(sample.percent)),
          ...(sample.seed === undefined
            ? []
            : [' REPEATABLE ', ...this.wrap(this.#expr.expression(sample.seed))]),
        ];
  }
}
