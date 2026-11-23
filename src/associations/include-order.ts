import { SqlExpression } from '../expressions/methods.ts';
import type { ModelDefinition } from '../model/model-definition.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import { SelectQueryBuilder } from '../model/select-query-builder.ts';
import { SqlAst, type OrderNode } from '../sql/ast.ts';
import { OrderDirection } from '../sql/order.ts';
import type { IncludeNode, IncludeOptions } from './include.ts';

const ast = new SqlAst();
const attributeColumns = new AttributeColumns();
const selects = new SelectQueryBuilder(attributeColumns);

type WhereContext = ReturnType<AttributeColumns['whereCompiler']>;

/** ORDER BY nodes: all of them, and those that belong inside the main-table subquery. */
export type OrderNodes = Readonly<{ all: readonly OrderNode[]; main: readonly OrderNode[] }>;

const field = (definition: ModelDefinition, name: string): string =>
  definition.attributes.get(name)?.field ?? name;

/** Resolves `order` items that reference an include (`[Include, 'attr', 'DESC']`). */
export class IncludeOrder {
  /**
   * Order nodes of a find, resolving items that go through includes.
   *
   * @param definition - Main model definition.
   * @param includes - Joined includes.
   * @param order - `order` option.
   * @param mainAlias - Main table alias.
   * @returns All order nodes and the ones for the subquery.
   */
  nodes(
    definition: ModelDefinition,
    includes: readonly IncludeNode[],
    order: unknown,
    mainAlias: string,
  ): OrderNodes {
    if (order === undefined || order === null) {
      return { all: [], main: [] };
    }
    const ctx = attributeColumns.whereCompiler(definition, mainAlias);
    const items: readonly unknown[] = Array.isArray(order) ? order : [order];
    const resolved = items.map((item) => this.#resolve(definition, includes, item, mainAlias, ctx));
    return {
      all: resolved.map((entry) => entry.node),
      main: resolved.filter((entry) => entry.main).map((entry) => entry.node),
    };
  }

  #resolve(
    definition: ModelDefinition,
    includes: readonly IncludeNode[],
    item: unknown,
    mainAlias: string,
    ctx: WhereContext,
  ): Readonly<{ node: OrderNode; main: boolean }> {
    const viaInclude = this.#viaInclude(includes, item);
    if (viaInclude !== undefined) {
      return { node: viaInclude, main: false };
    }
    const node =
      item instanceof SqlExpression
        ? { expr: attributeColumns.where(item, ctx) ?? ast.raw('1') }
        : selects.orderItem(definition, mainAlias, ctx, item);
    return { node, main: true };
  }

  #viaInclude(includes: readonly IncludeNode[], item: unknown): OrderNode | undefined {
    const throughInclude =
      Array.isArray(item) &&
      (item.length > 2 ||
        (item.length === 2 && typeof item[0] !== 'string' && !(item[0] instanceof SqlExpression)));
    return throughInclude ? this.#includeOrder(includes, item as readonly unknown[]) : undefined;
  }

  #hasDirection(item: readonly unknown[]): boolean {
    const last = item[item.length - 1];
    if (typeof last !== 'string') {
      return false;
    }
    try {
      OrderDirection.parse(last);
      return true;
    } catch {
      return false;
    }
  }

  #includeOrder(includes: readonly IncludeNode[], item: readonly unknown[]): OrderNode | undefined {
    const hasDirection = this.#hasDirection(item);
    const parts = hasDirection ? item.slice(0, -1) : item;
    const attribute = parts.at(-1);
    const references = parts.slice(0, -1);
    if (references.length === 0 || typeof attribute !== 'string') {
      return undefined;
    }
    const node = this.#walk(includes, references);
    return node === undefined
      ? undefined
      : {
          expr: ast.ident(node.alias, field(node.definition, attribute)),
          ...(hasDirection ? OrderDirection.parse(item[item.length - 1]) : {}),
        };
  }

  #walk(includes: readonly IncludeNode[], references: readonly unknown[]): IncludeNode | undefined {
    return references.reduce<Readonly<{ nodes: readonly IncludeNode[]; node?: IncludeNode }>>(
      (acc, reference) => {
        const found = this.#find(acc.nodes, reference);
        return { nodes: found?.children ?? [], node: found };
      },
      { nodes: includes },
    ).node;
  }

  #find(nodes: readonly IncludeNode[], reference: unknown): IncludeNode | undefined {
    return nodes.find((node) => this.#matches(node, reference));
  }

  #matches(node: IncludeNode, reference: unknown): boolean {
    if (typeof reference === 'string') {
      return node.as === reference;
    }
    if (typeof reference === 'function') {
      return node.model === reference;
    }
    if (node.association === reference) {
      return true;
    }
    if (typeof reference !== 'object' || reference === null || !('model' in reference)) {
      return false;
    }
    const options = reference as IncludeOptions;
    return node.model === options.model && (options.as === undefined || node.as === options.as);
  }
}
