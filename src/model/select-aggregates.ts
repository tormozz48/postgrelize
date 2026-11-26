import type { WhereCompiler } from '../where/where.ts';
import { Fn } from '../expressions/methods.ts';
import { SqlAst, type ExprNode } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { SelectOptions } from './select-options.ts';
import type { SelectTargets } from './select-targets.ts';

const ast = new SqlAst();

const aggregateColumn = (
  name: string,
  target: ExprNode,
  distinct: boolean | undefined,
  alias: string,
): ExprNode => ({
  kind: 'alias',
  expr: {
    kind: 'fn',
    name,
    args: [target],
    ...(distinct === true ? { distinct: true } : {}),
  },
  alias,
});

/** Selected columns of `count()` and `aggregate()`: the grouped columns and the aggregate. */
export class SelectAggregates {
  readonly #columns: AttributeColumns;
  readonly #targets: SelectTargets;

  /**
   * @param columns - Attribute to column mapping.
   * @param targets - Converts attribute names and expressions.
   */
  constructor(columns: AttributeColumns, targets: SelectTargets) {
    this.#columns = columns;
    this.#targets = targets;
  }

  /**
   * Columns of `SELECT count(...) AS "count"`.
   *
   * @param definition - Model definition.
   * @param options - Select options with `col` / `distinct`.
   * @returns Group columns followed by the count.
   */
  count(
    definition: ModelDefinition,
    options: SelectOptions & Readonly<{ col?: string; distinct?: boolean }>,
  ): readonly ExprNode[] {
    const alias = definition.name;
    const count = aggregateColumn(
      'count',
      this.#countTarget(definition, options),
      options.distinct,
      'count',
    );
    const ctx = this.#columns.whereCompiler(definition, alias);
    return [...this.#targets.list(definition, alias, ctx, options.group), count];
  }

  /**
   * Columns of `SELECT fn(field) AS "fn"`.
   *
   * @param definition - Model definition.
   * @param field - Attribute name or `'*'`.
   * @param aggregateFunction - Aggregate function name.
   * @param options - Select options with `distinct`.
   * @returns Group columns followed by the aggregate.
   */
  aggregate(
    definition: ModelDefinition,
    field: string,
    aggregateFunction: string,
    options: SelectOptions & Readonly<{ distinct?: boolean }>,
  ): readonly ExprNode[] {
    const alias = definition.name;
    const ctx = this.#columns.whereCompiler(definition, alias);
    const target: ExprNode =
      field === '*' ? { kind: 'star' } : this.#targets.target(definition, alias, ctx, field);
    const column = aggregateColumn(
      Fn.validName(aggregateFunction),
      target,
      options.distinct,
      aggregateFunction,
    );
    return [...this.#beside(definition, alias, ctx, options), column];
  }

  // like v6, given `attributes` are selected in place of the group columns (`group` may name an alias)
  #beside(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    options: SelectOptions,
  ): readonly ExprNode[] {
    return Array.isArray(options.attributes)
      ? this.#targets.columns(definition, alias, ctx, options.attributes)
      : this.#targets.list(definition, alias, ctx, options.group);
  }

  #countTarget(
    definition: ModelDefinition,
    options: Readonly<{ col?: string; distinct?: boolean }>,
  ): ExprNode {
    const alias = definition.name;
    if (options.col !== undefined) {
      const ctx = this.#columns.whereCompiler(definition, alias);
      return this.#targets.target(definition, alias, ctx, options.col);
    }
    return options.distinct === true
      ? ast.ident(
          alias,
          definition.attributes.get(definition.primaryKeys[0] ?? 'id')?.field ?? 'id',
        )
      : { kind: 'star' };
  }
}
