import { SqlExpression } from '../expressions/methods.ts';
import { SqlLiteral } from '../ddl/sql-literal.ts';
import { SqlAst, type ExprNode, type FromItem, type JsonTableColumn } from '../sql/ast.ts';
import { WhereCompiler } from '../where/where.ts';
import { validCastType } from '../where/operator-allowlist.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { JsonTableColumnOptions, JsonTableOptions } from './source-options.ts';
import { TableSampleBuilder } from './table-sample-builder.ts';

const ast = new SqlAst();
const literals = new SqlLiteral();
const values = new WhereCompiler({ resolve: () => undefined });

const expr = (value: unknown): ExprNode => values.toExpr(value);

type Plain = Readonly<Record<string, unknown>>;

/** Converts the object forms of a `from` entry (`values`, `function`, `jsonTable`, `lateral`, `model` + `sample`). */
export class SourceOptionBuilder {
  readonly #registry: ModelRegistry;
  readonly #columns: AttributeColumns;
  readonly #samples = new TableSampleBuilder();

  /**
   * @param registry - Model definitions.
   * @param columns - Table references of models.
   */
  constructor(registry: ModelRegistry, columns: AttributeColumns) {
    this.#registry = registry;
    this.#columns = columns;
  }

  /**
   * Builds the FROM item of an object-form source.
   *
   * @param alias - Alias of the relation.
   * @param source - Source option.
   * @returns FROM item.
   * @throws Error for inconsistent options.
   */
  build(alias: string, source: Plain): FromItem {
    if ('values' in source) {
      return SourceOptionBuilder.#values(alias, source['values'] as Plain);
    }
    if ('function' in source) {
      return SourceOptionBuilder.#function(alias, source);
    }
    return 'jsonTable' in source || 'lateral' in source
      ? SourceOptionBuilder.#nested(alias, source)
      : {
          ...this.#columns.table(this.#registry.definition(source['model'] as never), alias),
          sample: this.#samples.build(source['sample'] as never),
        };
  }

  static #nested(alias: string, source: Plain): FromItem {
    return 'jsonTable' in source
      ? {
          jsonTable: SourceOptionBuilder.#jsonTable(source['jsonTable'] as JsonTableOptions),
          alias,
        }
      : { subquery: (source['lateral'] as { build(): never }).build(), alias, lateral: true };
  }

  static #values(alias: string, spec: Plain): FromItem {
    const columns = spec['columns'] as readonly string[];
    const rows = spec['rows'] as readonly (readonly unknown[])[];
    if (rows.length === 0 || columns.length === 0) {
      throw new Error('values needs at least one column and one row');
    }
    if (rows.some((row) => row.length !== columns.length)) {
      throw new Error('every row of values must have one cell per column');
    }
    return { values: rows.map((row) => row.map(expr)), alias, columns };
  }

  static #function(alias: string, source: Plain): FromItem {
    const ordinality = source['ordinality'] as string | undefined;
    const columns = source['columns'] as readonly string[] | undefined;
    if (ordinality !== undefined && columns === undefined) {
      throw new Error('function with ordinality needs columns');
    }
    return {
      function: String(source['function']).split('.'),
      args: ((source['args'] as readonly unknown[] | undefined) ?? []).map(expr),
      alias,
      ...(columns === undefined
        ? {}
        : { columns: ordinality === undefined ? columns : [...columns, ordinality] }),
      ...(ordinality === undefined ? {} : { ordinality }),
    };
  }

  static #jsonTable(
    options: JsonTableOptions,
  ): Extract<FromItem, { jsonTable: unknown }>['jsonTable'] {
    return {
      doc:
        options.doc instanceof SqlExpression
          ? expr(options.doc)
          : { kind: 'cast', expr: ast.param(JSON.stringify(options.doc)), type: 'jsonb' },
      path: literals.escape(options.path),
      columns: options.columns.map((column) => SourceOptionBuilder.#jsonColumn(column)),
    };
  }

  static #jsonColumn(column: JsonTableColumnOptions): JsonTableColumn {
    if (column.ordinality === true) {
      return { name: column.name, kind: 'ordinality' };
    }
    const exists = column.exists === true;
    const type = column.type ?? (exists ? 'boolean' : undefined);
    if (type === undefined) {
      throw new Error(`JSON_TABLE column "${column.name}" needs a type`);
    }
    return {
      name: column.name,
      kind: exists ? 'exists' : 'value',
      type: validCastType(type),
      ...(column.path === undefined ? {} : { path: literals.escape(column.path) }),
    };
  }
}
