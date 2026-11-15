import { DdlGenerator } from '../ddl/ddl-generator.ts';
import { literal, Subquery } from '../expressions/methods.ts';
import { SqlAst, type ExprNode, type MergeNode, type MergeWhen } from '../sql/ast.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';
import type { Values } from './options.ts';
import type { WhereOptions } from './types.ts';

const ast = new SqlAst();

const ddl = new DdlGenerator();

/** One `WHEN MATCHED` / `WHEN NOT MATCHED BY SOURCE` action of `merge`. */
export type MergeMatchedAction<T> = Readonly<{
  /** Extra condition (`WHEN MATCHED AND ...`). */
  where?: WhereOptions<T> | unknown;
  /** Update the target row with these values / expressions (`col('source.attr')`). */
  update?: Partial<Record<keyof T & string, unknown>>;
  /** Delete the target row. */
  delete?: true;
  /** Do nothing. */
  nothing?: true;
}>;

/** `WHEN NOT MATCHED` action of `merge`. */
export type MergeInsertAction<T> = Readonly<{
  /** Extra condition (`WHEN NOT MATCHED AND ...`); may reference only source columns. */
  where?: unknown;
  /** Values to insert: `true` copies same-named source columns, or a map of values / expressions. */
  insert?: true | Partial<Record<keyof T & string, unknown>>;
  /** Do nothing. */
  nothing?: true;
}>;

/** Options of `Model.merge`. PostgreSQL 15+ (RETURNING: 17+). */
export type MergeOptions<T> = Readonly<{
  /** Source rows (plain objects) or a subquery. */
  source: readonly Readonly<Record<string, unknown>>[] | Subquery;
  /** Alias of the source; default `'source'`. */
  as?: string;
  /** Join condition between target (model alias) and source (`col('source.attr')`). */
  on: WhereOptions<T> | unknown;
  /** Actions for matched rows, applied in order. */
  whenMatched?: MergeMatchedAction<T> | readonly MergeMatchedAction<T>[];
  /** Actions for source rows without a target row. */
  whenNotMatched?: MergeInsertAction<T> | readonly MergeInsertAction<T>[];
  /** Actions for target rows without a source row (PostgreSQL 17+). */
  whenNotMatchedBySource?: MergeMatchedAction<T> | readonly MergeMatchedAction<T>[];
}>;

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value as T];

const castType = (definition: ModelDefinition, attribute: AttributeDefinition): string =>
  attribute.type.key === 'ENUM'
    ? [definition.schema, ddl.enumTypeName(definition.tableName, attribute.field)]
        .filter((part): part is string => part !== undefined)
        .map(SqlCompiler.quoteIdent)
        .join('.')
    : attribute.type.sqlType;

const timestamps = (definition: ModelDefinition, values: Values, creating: boolean): Values => ({
  ...(creating && definition.createdAt !== undefined && !(definition.createdAt in values)
    ? { [definition.createdAt]: literal('now()') }
    : {}),
  ...(definition.updatedAt !== undefined && !(definition.updatedAt in values)
    ? { [definition.updatedAt]: literal('now()') }
    : {}),
  ...values,
});

const sourceColumns = (source: MergeNode['source']): readonly string[] =>
  source.kind === 'values'
    ? source.columns
    : source.query.columns.map((column) =>
        column.kind === 'alias'
          ? column.alias
          : column.kind === 'ident'
            ? (column.path.at(-1) ?? '')
            : '',
      );

/**
 * Builds `MERGE INTO ... USING ...` statements of `Model.merge`: a VALUES or subquery source, the
 * join condition, `WHEN [NOT] MATCHED [BY SOURCE]` actions with timestamps, and RETURNING with
 * `merge_action()`.
 */
export class MergeQueryBuilder {
  /** Column carrying `merge_action()` in RETURNING. */
  static readonly ACTION = '__pgz_merge_action';

  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
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
    const alias = options.as ?? 'source';
    const source: MergeNode['source'] =
      options.source instanceof Subquery
        ? { kind: 'query', query: options.source.build(), alias }
        : this.#valuesSource(
            definition,
            options.source as readonly Readonly<Record<string, unknown>>[],
            alias,
          );
    const on = this.#condition(definition, options.on);
    if (on === undefined) {
      throw new Error('merge: on condition is required');
    }
    const when: readonly MergeWhen[] = [
      ...asArray(options.whenMatched).map((action): MergeWhen => {
        const extra = this.#condition(definition, action.where);
        return {
          match: 'MATCHED',
          ...(extra === undefined ? {} : { condition: extra }),
          action: this.#matchedAction(definition, action),
        };
      }),
      ...asArray(options.whenNotMatched).map((action): MergeWhen => {
        const extra = this.#condition(definition, action.where);
        return {
          match: 'NOT MATCHED',
          ...(extra === undefined ? {} : { condition: extra }),
          action:
            action.insert === undefined
              ? { kind: 'nothing' }
              : this.#insertAction(definition, source, action.insert as true | Values),
        };
      }),
      ...asArray(options.whenNotMatchedBySource).map((action): MergeWhen => {
        const extra = this.#condition(definition, action.where);
        return {
          match: 'NOT MATCHED BY SOURCE',
          ...(extra === undefined ? {} : { condition: extra }),
          action: this.#matchedAction(definition, action),
        };
      }),
    ];
    if (when.length === 0) {
      throw new Error('merge: at least one WHEN clause is required');
    }
    return {
      kind: 'merge',
      table: this.#columns.table(definition, definition.name),
      source,
      on,
      when,
      ...(returning
        ? {
            returning: [
              {
                kind: 'alias',
                expr: ast.fnCall('merge_action', []),
                alias: MergeQueryBuilder.ACTION,
              } as const,
              ...this.#columns.returningAll(definition, definition.name),
            ],
          }
        : {}),
    };
  }

  #valuesSource(
    definition: ModelDefinition,
    rows: readonly Readonly<Record<string, unknown>>[],
    alias: string,
  ): MergeNode['source'] {
    if (rows.length === 0) {
      throw new Error('merge: source rows must not be empty');
    }
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const ctx = this.#columns.whereCompiler(definition, undefined);
    return {
      kind: 'values',
      alias,
      columns: columns.map((name) => definition.attributes.get(name)?.field ?? name),
      rows: rows.map((row) =>
        columns.map((name): ExprNode => {
          const attribute = definition.attributes.get(name);
          const value = this.#columns.value(attribute, row[name] ?? null, ctx);
          return attribute === undefined || value.kind !== 'param'
            ? value
            : { kind: 'cast', expr: value, type: castType(definition, attribute) };
        }),
      ),
    };
  }

  #insertAction(
    definition: ModelDefinition,
    source: MergeNode['source'],
    insert: true | Values,
  ): MergeWhen['action'] {
    const ctx = this.#columns.whereCompiler(definition, undefined, undefined);
    const values: Values =
      insert === true
        ? Object.fromEntries(
            sourceColumns(source)
              .filter((field) => definition.fieldToAttribute.has(field))
              .map((field) => [
                definition.fieldToAttribute.get(field) ?? field,
                literal(`${SqlCompiler.quoteIdent(source.alias)}.${SqlCompiler.quoteIdent(field)}`),
              ]),
          )
        : insert;
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
}
