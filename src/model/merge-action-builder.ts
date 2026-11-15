import { literal } from '../expressions/methods.ts';
import type { ExprNode, MergeNode, MergeWhen, QueryNode, SelectNode } from '../sql/ast.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { MergeInsertAction, MergeMatchedAction, MergeOptions } from './merge-options.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { Values } from './options.ts';

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value as T];

const timestamps = (definition: ModelDefinition, values: Values, creating: boolean): Values => ({
  ...(creating && definition.createdAt !== undefined && !(definition.createdAt in values)
    ? { [definition.createdAt]: literal('now()') }
    : {}),
  ...(definition.updatedAt !== undefined && !(definition.updatedAt in values)
    ? { [definition.updatedAt]: literal('now()') }
    : {}),
  ...values,
});

// The column names of a set operation are those of its leftmost SELECT.
const leftmost = (query: QueryNode): SelectNode =>
  query.kind === 'setop' ? leftmost(query.left) : query;

const sourceColumns = (source: MergeNode['source']): readonly string[] =>
  source.kind === 'values'
    ? source.columns
    : leftmost(source.query).columns.map((column) =>
        column.kind === 'alias'
          ? column.alias
          : column.kind === 'ident'
            ? (column.path.at(-1) ?? '')
            : '',
      );

/** Builds the join condition and the `WHEN [NOT] MATCHED [BY SOURCE]` clauses of `Model.merge`. */
export class MergeActionBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Join condition between target and source.
   *
   * @param definition - Model definition.
   * @param where - `on` option.
   * @returns Condition.
   * @throws Error for a missing condition.
   */
  on(definition: ModelDefinition, where: unknown): ExprNode {
    const on = this.#condition(definition, where);
    if (on === undefined) {
      throw new Error('merge: on condition is required');
    }
    return on;
  }

  /**
   * WHEN clauses in order: matched, not matched, not matched by source.
   *
   * @param definition - Model definition.
   * @param options - Merge options.
   * @param source - MERGE source.
   * @returns WHEN clauses.
   * @throws Error without any WHEN clause.
   */
  whens(
    definition: ModelDefinition,
    options: MergeOptions<unknown>,
    source: MergeNode['source'],
  ): readonly MergeWhen[] {
    const when: readonly MergeWhen[] = [
      ...asArray(options.whenMatched).map((action) => this.#matched('MATCHED', definition, action)),
      ...asArray(options.whenNotMatched).map((action) =>
        this.#notMatched(definition, source, action),
      ),
      ...asArray(options.whenNotMatchedBySource).map((action) =>
        this.#matched('NOT MATCHED BY SOURCE', definition, action),
      ),
    ];
    if (when.length === 0) {
      throw new Error('merge: at least one WHEN clause is required');
    }
    return when;
  }

  #matched(
    match: MergeWhen['match'],
    definition: ModelDefinition,
    action: MergeMatchedAction<unknown>,
  ): MergeWhen {
    const extra = this.#condition(definition, action.where);
    return {
      match,
      ...(extra === undefined ? {} : { condition: extra }),
      action: this.#matchedAction(definition, action),
    };
  }

  #notMatched(
    definition: ModelDefinition,
    source: MergeNode['source'],
    action: MergeInsertAction<unknown>,
  ): MergeWhen {
    const extra = this.#condition(definition, action.where);
    return {
      match: 'NOT MATCHED',
      ...(extra === undefined ? {} : { condition: extra }),
      action:
        action.insert === undefined
          ? { kind: 'nothing' }
          : this.#insertAction(definition, source, action.insert as true | Values),
    };
  }

  #insertAction(
    definition: ModelDefinition,
    source: MergeNode['source'],
    insert: true | Values,
  ): MergeWhen['action'] {
    const ctx = this.#columns.whereCompiler(definition, undefined, undefined);
    const values = insert === true ? MergeActionBuilder.#sourceValues(definition, source) : insert;
    const items = this.#columns.setItems(
      definition,
      timestamps(definition, values, true),
      new WhereCompiler({ ...ctx.context, tableAlias: source.alias }),
    );
    return {
      kind: 'insert',
      columns: items.map((item) => item.column),
      values: items.map((item) => item.value),
    };
  }

  #matchedAction(
    definition: ModelDefinition,
    action: MergeMatchedAction<unknown>,
  ): MergeWhen['action'] {
    if (action.delete === true) {
      return { kind: 'delete' };
    }
    if (action.update !== undefined) {
      return {
        kind: 'update',
        set: this.#columns.setItems(
          definition,
          timestamps(definition, action.update as Values, false),
          this.#columns.whereCompiler(definition, definition.name),
        ),
      };
    }
    return { kind: 'nothing' };
  }

  #condition(definition: ModelDefinition, where: unknown): ExprNode | undefined {
    return WhereCompiler.isEmpty(where)
      ? undefined
      : this.#columns.whereCompiler(definition, definition.name).compile(where);
  }

  /** `insert: true` copies same-named source columns as `"source"."field"` references. */
  static #sourceValues(definition: ModelDefinition, source: MergeNode['source']): Values {
    return Object.fromEntries(
      sourceColumns(source)
        .filter((field) => definition.fieldToAttribute.has(field))
        .map((field) => [
          definition.fieldToAttribute.get(field) ?? field,
          literal(`${SqlCompiler.quoteIdent(source.alias)}.${SqlCompiler.quoteIdent(field)}`),
        ]),
    );
  }
}
