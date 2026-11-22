import type { ModelDefinition } from '../model/model-definition.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import { SqlAst, type ExprNode, type JoinNode } from '../sql/ast.ts';
import type { IncludeNode } from './include.ts';

const ast = new SqlAst();
const attributeColumns = new AttributeColumns();

type Through = NonNullable<IncludeNode['through']>;

const defined = (part: ExprNode | undefined): part is ExprNode => part !== undefined;

/** Column name of an attribute (the attribute name when it has no explicit field). */
const field = (definition: ModelDefinition, name: string): string =>
  definition.attributes.get(name)?.field ?? name;

/** Builds the JOIN nodes of an include and its nested includes. */
export class IncludeJoins {
  /**
   * Joins of an include: the target table, or junction then target for belongsToMany, followed by
   * the joins of the nested (non-separate) includes.
   *
   * @param parent - Definition of the parent model.
   * @param parentAlias - Table alias of the parent.
   * @param node - Include node.
   * @returns Join nodes.
   */
  joins(parent: ModelDefinition, parentAlias: string, node: IncludeNode): readonly JoinNode[] {
    return node.through === undefined
      ? this.#direct(parent, parentAlias, node)
      : this.#viaJunction(parent, parentAlias, node, node.through);
  }

  #type(node: IncludeNode): JoinNode['type'] {
    return node.right ? 'RIGHT OUTER' : node.required ? 'INNER' : 'LEFT OUTER';
  }

  #direct(parent: ModelDefinition, parentAlias: string, node: IncludeNode): readonly JoinNode[] {
    return [
      {
        type: this.#type(node),
        table: attributeColumns.table(node.definition, node.alias),
        on: ast.and([this.#joinKeys(parent, parentAlias, node), ...this.#extra(node)]),
      },
      ...this.#childJoins(node),
    ];
  }

  #joinKeys(parent: ModelDefinition, parentAlias: string, node: IncludeNode): ExprNode {
    const custom = attributeColumns.where(
      node.on,
      attributeColumns.whereCompiler(node.definition, node.alias),
    );
    return custom ?? this.#onClause(parent, parentAlias, node);
  }

  #viaJunction(
    parent: ModelDefinition,
    parentAlias: string,
    node: IncludeNode,
    through: Through,
  ): readonly JoinNode[] {
    return [
      {
        type: this.#type(node),
        table: attributeColumns.table(through.definition, through.alias),
        on: ast.and(this.#junctionCondition(parent, parentAlias, node, through)),
      },
      this.#targetJoin(node, through),
      ...this.#childJoins(node),
    ];
  }

  #targetJoin(node: IncludeNode, through: Through): JoinNode {
    return {
      type: this.#type(node),
      table: attributeColumns.table(node.definition, node.alias),
      on: ast.and([
        ast.binary(
          '=',
          ast.ident(node.alias, field(node.definition, node.association.targetKey)),
          ast.ident(through.alias, field(through.definition, node.association.otherKey ?? '')),
        ),
        ...this.#extra(node),
      ]),
    };
  }

  #junctionCondition(
    parent: ModelDefinition,
    parentAlias: string,
    node: IncludeNode,
    through: Through,
  ): readonly ExprNode[] {
    return [
      ast.binary(
        '=',
        ast.ident(parentAlias, field(parent, node.association.sourceKey)),
        ast.ident(through.alias, field(through.definition, node.association.foreignKey)),
      ),
      attributeColumns.where(
        through.where,
        attributeColumns.whereCompiler(through.definition, through.alias),
      ),
      this.#scopeCondition(through.definition, through.alias, node.association.through?.scope),
    ].filter(defined);
  }

  #childJoins(node: IncludeNode): readonly JoinNode[] {
    return node.children
      .filter((child) => !child.separate)
      .flatMap((child) => this.joins(node.definition, node.alias, child));
  }

  #extra(node: IncludeNode): readonly ExprNode[] {
    return [
      this.#condition(node.definition, node.alias, node.where, node.paranoid),
      this.#scopeCondition(node.definition, node.alias, node.association.scope),
    ].filter(defined);
  }

  #condition(
    definition: ModelDefinition,
    alias: string,
    where: unknown,
    paranoid: boolean,
  ): ExprNode | undefined {
    const condition = attributeColumns.where(
      where,
      attributeColumns.whereCompiler(definition, alias),
    );
    const notDeleted = paranoid ? this.#notDeleted(definition, alias) : undefined;
    const parts = [condition, notDeleted].filter(defined);
    return parts.length === 0 ? undefined : ast.and(parts);
  }

  #notDeleted(definition: ModelDefinition, alias: string): ExprNode | undefined {
    return definition.deletedAt === undefined
      ? undefined
      : ({
          kind: 'postfix',
          op: 'IS NULL',
          expr: ast.ident(alias, field(definition, definition.deletedAt)),
        } as const);
  }

  #scopeCondition(
    definition: ModelDefinition,
    alias: string,
    scope: Readonly<Record<string, unknown>> | undefined,
  ): ExprNode | undefined {
    return scope === undefined
      ? undefined
      : attributeColumns.where(scope, attributeColumns.whereCompiler(definition, alias));
  }

  #onClause(parent: ModelDefinition, parentAlias: string, node: IncludeNode): ExprNode {
    const { association } = node;
    return association.associationType === 'BelongsTo'
      ? ast.binary(
          '=',
          ast.ident(parentAlias, field(parent, association.foreignKey)),
          ast.ident(node.alias, field(node.definition, association.targetKey)),
        )
      : ast.binary(
          '=',
          ast.ident(parentAlias, field(parent, association.sourceKey)),
          ast.ident(node.alias, field(node.definition, association.foreignKey)),
        );
  }
}
