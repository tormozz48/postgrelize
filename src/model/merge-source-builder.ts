import { DdlGenerator } from '../ddl/ddl-generator.ts';
import { Subquery } from '../expressions/methods.ts';
import type { ExprNode, MergeNode } from '../sql/ast.ts';
import { SqlCompiler } from '../sql/compile.ts';
import type { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { MergeOptions } from './merge-options.ts';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';

type SourceRow = Readonly<Record<string, unknown>>;

const ddl = new DdlGenerator();

const castType = (definition: ModelDefinition, attribute: AttributeDefinition): string =>
  attribute.type.key === 'ENUM'
    ? [definition.schema, ddl.enumTypeName(definition.tableName, attribute.field)]
        .filter((part): part is string => part !== undefined)
        .map(SqlCompiler.quoteIdent)
        .join('.')
    : attribute.type.sqlType;

/** Builds the `USING` source of `Model.merge`: a subquery or typed `VALUES` rows. */
export class MergeSourceBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Builds the MERGE source.
   *
   * @param definition - Model definition.
   * @param source - Source rows (plain objects) or a subquery.
   * @param alias - Alias of the source.
   * @returns MERGE source.
   * @throws Error for empty source rows.
   */
  build(
    definition: ModelDefinition,
    source: MergeOptions<unknown>['source'],
    alias: string,
  ): MergeNode['source'] {
    return source instanceof Subquery
      ? { kind: 'query', query: source.build(), alias }
      : this.#values(definition, source as readonly SourceRow[], alias);
  }

  #values(
    definition: ModelDefinition,
    rows: readonly SourceRow[],
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
      rows: rows.map((row) => columns.map((name) => this.#cell(definition, ctx, name, row[name]))),
    };
  }

  #cell(definition: ModelDefinition, ctx: WhereCompiler, name: string, raw: unknown): ExprNode {
    const attribute = definition.attributes.get(name);
    const value = this.#columns.value(attribute, raw ?? null, ctx);
    return attribute === undefined || value.kind !== 'param'
      ? value
      : { kind: 'cast', expr: value, type: castType(definition, attribute) };
  }
}
