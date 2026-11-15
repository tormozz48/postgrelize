import type { ModelDefinition } from '../model/model-definition.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import { SelectQueryBuilder, type FindAttributeOptions } from '../model/select-query-builder.ts';
import { SqlAst, type ExprNode } from '../sql/ast.ts';
import type { IncludeNode } from './include.ts';

const ast = new SqlAst();
const attributeColumns = new AttributeColumns();
const selects = new SelectQueryBuilder(attributeColumns);

const field = (definition: ModelDefinition, name: string): string =>
  definition.attributes.get(name)?.field ?? name;

const parentKey = (node: IncludeNode): string =>
  node.association.associationType === 'BelongsTo'
    ? node.association.foreignKey
    : node.association.sourceKey;

const selectsField = (column: ExprNode, name: string, fieldName: string): boolean =>
  column.kind === 'star' ||
  (column.kind === 'ident' && column.path.at(-1) === fieldName) ||
  (column.kind === 'alias' && column.alias === name);

/** Columns an include adds to the SELECT, aliased by result path (`Posts.title`). */
export class IncludeColumns {
  /**
   * Prefixed columns of an include, its junction and its nested includes.
   *
   * @param node - Include node.
   * @returns Aliased column expressions.
   */
  columns(node: IncludeNode): readonly ExprNode[] {
    const { through } = node;
    return [
      ...this.#prefixed(node.definition, node.alias, node.path, node.attributes),
      ...(through === undefined
        ? []
        : this.#prefixed(through.definition, through.alias, through.path, through.attributes)),
      ...node.children.filter((child) => !child.separate).flatMap((child) => this.columns(child)),
    ];
  }

  /**
   * Join keys of the main table that the subquery must expose for the outer joins.
   *
   * @param definition - Main model definition.
   * @param alias - Main table alias.
   * @param columns - Columns already selected.
   * @param joined - Joined includes.
   * @returns Missing key columns.
   */
  missingKeys(
    definition: ModelDefinition,
    alias: string,
    columns: readonly ExprNode[],
    joined: readonly IncludeNode[],
  ): readonly ExprNode[] {
    return [...new Set(joined.map(parentKey))]
      .filter(
        (name) => !columns.some((column) => selectsField(column, name, field(definition, name))),
      )
      .map((name) => ast.ident(alias, field(definition, name)));
  }

  #prefixed(
    definition: ModelDefinition,
    alias: string,
    path: string,
    attributes: FindAttributeOptions | undefined,
  ): readonly ExprNode[] {
    return selects
      .columns(definition, alias, attributeColumns.whereCompiler(definition, alias), attributes)
      .map((column) => {
        const expr = column.kind === 'alias' ? column.expr : column;
        return { kind: 'alias', expr, alias: `${path}.${this.#name(definition, column)}` } as const;
      });
  }

  #name(definition: ModelDefinition, column: ExprNode): string {
    return column.kind === 'alias'
      ? column.alias
      : column.kind === 'ident'
        ? (definition.fieldToAttribute.get(column.path.at(-1) ?? '') ?? column.path.at(-1) ?? '')
        : '';
  }
}
