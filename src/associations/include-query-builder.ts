import { SqlExpression } from '../expressions/methods.ts';
import type { ModelDefinition } from '../model/model-definition.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import { SelectQueryBuilder, type FindAttributeOptions } from '../model/select-query-builder.ts';
import {
  SqlAst,
  type ExprNode,
  type JoinNode,
  type OrderNode,
  type SelectNode,
} from '../sql/ast.ts';
import { OrderDirection } from '../sql/order.ts';
import type { IncludeNode, IncludeOptions } from './include.ts';

const ast = new SqlAst();
const attributeColumns = new AttributeColumns();
const selects = new SelectQueryBuilder(attributeColumns);

/** Options of the main query that affect the include joins. */
export type IncludeQueryOptions = Readonly<{
  /** `order` option (may reference includes). */
  order?: unknown;
  /** `limit` option. */
  limit?: number | null;
  /** `offset` option. */
  offset?: number | null;
  /** `subQuery: false` disables the sub-query form. */
  subQuery?: boolean;
}>;

const isMulti = (node: IncludeNode): boolean => node.association.isMultiAssociation;

const field = (definition: ModelDefinition, name: string): string =>
  definition.attributes.get(name)?.field ?? name;

const joinType = (node: IncludeNode, required: boolean): JoinNode['type'] =>
  node.right ? 'RIGHT OUTER' : required ? 'INNER' : 'LEFT OUTER';

const aliasesOf = (nodes: readonly IncludeNode[]): readonly string[] =>
  nodes.flatMap((node) => [node.alias, ...aliasesOf(node.children)]);

/** True when a condition references a joined include (`$Include.attr$`) as a table. */
const referencesIncludes = (where: ExprNode | undefined, includes: readonly IncludeNode[]) => {
  if (where === undefined) {
    return false;
  }
  const text = JSON.stringify(where);
  return aliasesOf(includes).some((alias) => text.includes(`"path":[${JSON.stringify(alias)},`));
};

const parentKey = (node: IncludeNode): string =>
  node.association.associationType === 'BelongsTo'
    ? node.association.foreignKey
    : node.association.sourceKey;

const selectsField = (column: ExprNode, name: string, fieldName: string): boolean =>
  column.kind === 'star' ||
  (column.kind === 'ident' && column.path.at(-1) === fieldName) ||
  (column.kind === 'alias' && column.alias === name);

const isModel = (value: unknown): boolean => typeof value === 'function';

const findNode = (nodes: readonly IncludeNode[], reference: unknown): IncludeNode | undefined =>
  nodes.find((node) =>
    typeof reference === 'string'
      ? node.as === reference
      : isModel(reference)
        ? node.model === reference
        : typeof reference === 'object' && reference !== null && 'model' in reference
          ? node.model === (reference as IncludeOptions).model &&
            ((reference as IncludeOptions).as === undefined ||
              node.as === (reference as IncludeOptions).as)
          : false,
  );

/**
 * Adds include joins, columns and ordering to a SELECT of the main model (ADR-009): decides the
 * v6 sub-query form for `limit` with multi includes, turns required includes into `EXISTS`
 * filters there, and builds the joins of `count` with includes.
 */
export class IncludeQueryBuilder {
  /**
   * Adds joins, include columns and include ordering to a SELECT built for the main model.
   *
   * @param definition - Main model definition.
   * @param base - SELECT of the main model.
   * @param includes - Include tree.
   * @param options - Order / limit / offset / subQuery of the find.
   * @returns SELECT with the includes.
   */
  build(
    definition: ModelDefinition,
    base: SelectNode,
    includes: readonly IncludeNode[],
    options: IncludeQueryOptions,
  ): SelectNode {
    const alias = definition.name;
    const joined = includes.filter((node) => !node.separate);
    const order = this.#orderNodes(definition, joined, options.order, alias);
    if (!this.needsSubQuery(joined, options, base.where)) {
      return {
        ...base,
        columns: [...base.columns, ...joined.flatMap((node) => this.#columns(node))],
        joins: joined.flatMap((node) => this.#joins(definition, alias, node)),
        orderBy: order.all,
      };
    }
    const requiredFilters = joined
      .filter((node) => node.required)
      .map((node) => this.#existsFilter(definition, alias, node));
    const inner: SelectNode = {
      ...base,
      columns: [
        ...base.columns,
        ...this.#missingKeyColumns(definition, alias, base.columns, joined),
      ],
      ...(base.where === undefined && requiredFilters.length === 0
        ? {}
        : {
            where: ast.and([...(base.where === undefined ? [] : [base.where]), ...requiredFilters]),
          }),
      orderBy: order.main,
    };
    return {
      kind: 'select',
      columns: [{ kind: 'star', table: alias }, ...joined.flatMap((node) => this.#columns(node))],
      from: { subquery: inner, alias },
      joins: joined.flatMap((node) => this.#joins(definition, alias, node)),
      orderBy: order.all,
      ...(base.lock === undefined ? {} : { lock: base.lock }),
    };
  }

  /**
   * Whether `limit`/`offset` must go into a subquery of the main table (v6 rules). A top-level
   * `where` that references a joined include cannot run inside that subquery, so it disables it.
   *
   * @param includes - Joined includes.
   * @param options - Limit / offset / subQuery of the find.
   * @param where - Compiled top-level condition.
   * @returns True for the sub-query form.
   */
  needsSubQuery(
    includes: readonly IncludeNode[],
    options: Readonly<{ limit?: number | null; offset?: number | null; subQuery?: boolean }>,
    where?: ExprNode,
  ): boolean {
    return (
      options.subQuery !== false &&
      !referencesIncludes(where, includes) &&
      ((options.limit !== undefined && options.limit !== null) ||
        (options.offset !== undefined && options.offset !== null)) &&
      includes.some(
        (node) =>
          !node.separate && (isMulti(node) || node.children.some((child) => isMulti(child))),
      )
    );
  }

  /**
   * Joins for `count` with includes (no include columns).
   *
   * @param definition - Main model definition.
   * @param includes - Include tree.
   * @returns Join nodes.
   */
  countJoins(definition: ModelDefinition, includes: readonly IncludeNode[]): readonly JoinNode[] {
    return includes
      .filter((node) => !node.separate)
      .flatMap((node) => this.#joins(definition, definition.name, node));
  }

  #prefixColumns(
    definition: ModelDefinition,
    alias: string,
    path: string,
    attributes: FindAttributeOptions | undefined,
  ): readonly ExprNode[] {
    return selects
      .columns(definition, alias, attributeColumns.whereCompiler(definition, alias), attributes)
      .map((column) => {
        const name =
          column.kind === 'alias'
            ? column.alias
            : column.kind === 'ident'
              ? (definition.fieldToAttribute.get(column.path.at(-1) ?? '') ??
                column.path.at(-1) ??
                '')
              : '';
        const expr = column.kind === 'alias' ? column.expr : column;
        return { kind: 'alias', expr, alias: `${path}.${name}` } as const;
      });
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
    const notDeleted =
      paranoid && definition.deletedAt !== undefined
        ? ({
            kind: 'postfix',
            op: 'IS NULL',
            expr: ast.ident(alias, field(definition, definition.deletedAt)),
          } as const)
        : undefined;
    const parts = [condition, notDeleted].filter((part): part is ExprNode => part !== undefined);
    return parts.length === 0 ? undefined : ast.and(parts);
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

  #joins(parent: ModelDefinition, parentAlias: string, node: IncludeNode): readonly JoinNode[] {
    const extra = [
      this.#condition(node.definition, node.alias, node.where, node.paranoid),
      this.#scopeCondition(node.definition, node.alias, node.association.scope),
    ];
    const through = node.through;
    if (through === undefined) {
      return [
        {
          type: joinType(node, node.required),
          table: attributeColumns.table(node.definition, node.alias),
          on: ast.and([
            this.#onClause(parent, parentAlias, node),
            ...extra.filter((part): part is ExprNode => part !== undefined),
          ]),
        },
        ...node.children
          .filter((child) => !child.separate)
          .flatMap((child) => this.#joins(node.definition, node.alias, child)),
      ];
    }
    const throughCondition = [
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
    ].filter((part): part is ExprNode => part !== undefined);
    return [
      {
        type: joinType(node, node.required),
        table: attributeColumns.table(through.definition, through.alias),
        on: ast.and(throughCondition),
      },
      {
        type: joinType(node, node.required),
        table: attributeColumns.table(node.definition, node.alias),
        on: ast.and([
          ast.binary(
            '=',
            ast.ident(node.alias, field(node.definition, node.association.targetKey)),
            ast.ident(through.alias, field(through.definition, node.association.otherKey ?? '')),
          ),
          ...extra.filter((part): part is ExprNode => part !== undefined),
        ]),
      },
      ...node.children
        .filter((child) => !child.separate)
        .flatMap((child) => this.#joins(node.definition, node.alias, child)),
    ];
  }

  #columns(node: IncludeNode): readonly ExprNode[] {
    return [
      ...this.#prefixColumns(node.definition, node.alias, node.path, node.attributes),
      ...(node.through === undefined
        ? []
        : this.#prefixColumns(
            node.through.definition,
            node.through.alias,
            node.through.path,
            node.through.attributes,
          )),
      ...node.children.filter((child) => !child.separate).flatMap((child) => this.#columns(child)),
    ];
  }

  #includeOrder(includes: readonly IncludeNode[], item: readonly unknown[]): OrderNode | undefined {
    const directionIndex = item.length - 1;
    const hasDirection =
      typeof item[directionIndex] === 'string' &&
      (() => {
        try {
          OrderDirection.parse(item[directionIndex]);
          return true;
        } catch {
          return false;
        }
      })();
    const parts = hasDirection ? item.slice(0, -1) : item;
    const attribute = parts.at(-1);
    const references = parts.slice(0, -1);
    if (references.length === 0 || typeof attribute !== 'string') {
      return undefined;
    }
    const node = references.reduce<{
      nodes: readonly IncludeNode[];
      node: IncludeNode | undefined;
    }>(
      (acc, reference) => {
        const found = findNode(acc.nodes, reference);
        return { nodes: found?.children ?? [], node: found };
      },
      { nodes: includes, node: undefined },
    ).node;
    if (node === undefined) {
      return undefined;
    }
    return {
      expr: ast.ident(node.alias, field(node.definition, attribute)),
      ...(hasDirection ? OrderDirection.parse(item[directionIndex]) : {}),
    };
  }

  #orderNodes(
    definition: ModelDefinition,
    includes: readonly IncludeNode[],
    order: unknown,
    mainAlias: string,
  ): Readonly<{ all: readonly OrderNode[]; main: readonly OrderNode[] }> {
    if (order === undefined || order === null) {
      return { all: [], main: [] };
    }
    const ctx = attributeColumns.whereCompiler(definition, mainAlias);
    const items: readonly unknown[] = Array.isArray(order) ? order : [order];
    const resolved = items.map((item) => {
      const viaInclude =
        Array.isArray(item) && item.length > 2
          ? this.#includeOrder(includes, item)
          : Array.isArray(item) &&
              item.length === 2 &&
              typeof item[0] !== 'string' &&
              !(item[0] instanceof SqlExpression)
            ? this.#includeOrder(includes, item)
            : undefined;
      return viaInclude === undefined
        ? {
            node:
              item instanceof SqlExpression
                ? { expr: attributeColumns.where(item, ctx) ?? ast.raw('1') }
                : selects.orderItem(definition, mainAlias, ctx, item),
            main: true,
          }
        : { node: viaInclude, main: false };
    });
    return {
      all: resolved.map((entry) => entry.node),
      main: resolved.filter((entry) => entry.main).map((entry) => entry.node),
    };
  }

  #existsFilter(parent: ModelDefinition, parentAlias: string, node: IncludeNode): ExprNode {
    const joins = this.#joins(parent, parentAlias, {
      ...node,
      children: node.children.filter((child) => child.required),
      required: true,
    });
    const [first, ...rest] = joins;
    if (first === undefined) {
      return ast.raw('TRUE');
    }
    const query: SelectNode = {
      kind: 'select',
      columns: [ast.raw('1')],
      from: first.table,
      ...(rest.length === 0 ? {} : { joins: rest }),
      where: first.on,
    };
    return { kind: 'prefix', op: 'EXISTS', expr: { kind: 'subquery', query } };
  }

  /** Join keys of the main table that the subquery must expose for the outer joins. */
  #missingKeyColumns(
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
}
