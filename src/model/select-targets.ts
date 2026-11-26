import type { VirtualType } from '../data-types/virtual-type.ts';
import { SqlExpression } from '../expressions/methods.ts';
import { SqlAst, type ExprNode, type OrderNode } from '../sql/ast.ts';
import { OrderDirection } from '../sql/order.ts';
import type { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { AttributeSpec, FindAttributeOptions, Order, OrderItem } from './select-options.ts';

const ast = new SqlAst();

const invalidOrder = (): never => {
  throw new Error('Order must be type of array or instance of a valid sequelize method.');
};

/**
 * Converts the attribute and expression lists of finders into SELECT expressions: `attributes`,
 * `order`, `group` and `distinctOn` items, including `'jsonAttr.a.b'` paths.
 */
export class SelectTargets {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Selected columns for the `attributes` option.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param attributes - `attributes` option.
   * @returns Column expressions.
   */
  columns(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    attributes: FindAttributeOptions | undefined,
  ): readonly ExprNode[] {
    if (attributes === undefined || !Array.isArray(attributes)) {
      return this.#specColumns(definition, alias, ctx, (attributes ?? {}) as AttributeSpec);
    }
    return SelectTargets.#withDependencies(definition, attributes).map((item) =>
      this.#attributeItem(definition, alias, ctx, item),
    );
  }

  // A VIRTUAL attribute has no column: selecting it selects the attributes it depends on (v6).
  static #withDependencies(
    definition: ModelDefinition,
    attributes: readonly unknown[],
  ): readonly (string | readonly [unknown, string])[] {
    const list = (attributes as readonly (string | readonly [unknown, string])[]).flatMap(
      (item) => {
        const type = typeof item === 'string' ? definition.attributes.get(item)?.type : undefined;
        return type?.isVirtual === true ? [...((type as VirtualType).dependencies ?? [])] : [item];
      },
    );
    return list.filter((item, index) => typeof item !== 'string' || list.indexOf(item) === index);
  }

  /**
   * One `order` item.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param item - Attribute name, `[target, direction]` or expression.
   * @returns Order node.
   */
  orderItem(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    item: unknown,
  ): OrderNode {
    if (Array.isArray(item)) {
      const [target, direction]: readonly unknown[] = item;
      return {
        expr: this.target(definition, alias, ctx, target),
        ...(direction === undefined ? {} : OrderDirection.parse(direction)),
      };
    }
    return { expr: this.target(definition, alias, ctx, item) };
  }

  /**
   * Expression of an attribute name, `'jsonAttr.a.b'` path, `'table.column'` or expression.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param target - Attribute name or expression.
   * @returns Expression.
   */
  target(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    target: unknown,
  ): ExprNode {
    return typeof target === 'string'
      ? definition.attributes.has(target)
        ? ast.ident(alias, definition.attributes.get(target)?.field ?? target)
        : (this.#jsonPathOrder(definition, alias, target) ?? ast.ident(...target.split('.')))
      : ctx.toExpr(target);
  }

  /**
   * `ORDER BY` items of the `order` option.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param order - `order` option.
   * @returns Order nodes.
   * @throws Error for an order that is neither a list nor an expression.
   */
  orderBy(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    order: Order | readonly OrderItem[] | undefined | null,
  ): readonly OrderNode[] {
    return order === undefined || order === null
      ? []
      : Array.isArray(order)
        ? order.map((item: unknown) => this.orderItem(definition, alias, ctx, item))
        : order instanceof SqlExpression
          ? [{ expr: ctx.toExpr(order) }]
          : invalidOrder();
  }

  /**
   * Expressions of a `group` or `distinctOn` option (one item or a list).
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param items - Attribute names or expressions.
   * @returns Expressions.
   */
  list(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    items: unknown,
  ): readonly ExprNode[] {
    return items === undefined
      ? []
      : (Array.isArray(items) ? items : [items]).map((item: unknown) =>
          // like v6, an item given as `['column', ...]` groups by its first element
          this.target(definition, alias, ctx, Array.isArray(item) ? item[0] : item),
        );
  }

  /**
   * Expressions of the `distinctOn` option.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @param ctx - Where compiler of the model.
   * @param items - Attribute names or expressions.
   * @returns Expressions.
   */
  distinctOn(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    items: readonly unknown[] | undefined,
  ): readonly ExprNode[] {
    return (items ?? []).map((item) => this.target(definition, alias, ctx, item));
  }

  #specColumns(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    spec: AttributeSpec,
  ): readonly ExprNode[] {
    const all = this.#columns.stored(definition).map((attribute) => attribute.fieldName);
    const excluded = new Set(spec.exclude ?? []);
    return [
      ...all
        .filter((name) => !excluded.has(name))
        .map((name) => SelectTargets.#columnFor(definition, alias, name)),
      ...(spec.include ?? []).map((item) => this.#attributeItem(definition, alias, ctx, item)),
    ];
  }

  #attributeItem(
    definition: ModelDefinition,
    alias: string,
    ctx: WhereCompiler,
    item: string | readonly [unknown, string],
  ): ExprNode {
    if (typeof item === 'string') {
      return SelectTargets.#columnFor(definition, alias, item);
    }
    if (!Array.isArray(item)) {
      // a bare `literal()` / `fn()` is a raw select item, like v6
      return ctx.toExpr(item);
    }
    const [source, name] = item as readonly [unknown, string];
    const expr =
      typeof source === 'string'
        ? ast.ident(alias, definition.attributes.get(source)?.field ?? source)
        : ctx.toExpr(source);
    return { kind: 'alias', expr, alias: name };
  }

  /** `'jsonAttr.a.b'` orders by the jsonb value at that path (numbers sort numerically). */
  #jsonPathOrder(definition: ModelDefinition, alias: string, target: string): ExprNode | undefined {
    const [name = '', ...path] = target.split('.');
    const attribute = definition.attributes.get(name);
    return attribute === undefined ||
      path.length === 0 ||
      (attribute.type.key !== 'JSON' && attribute.type.key !== 'JSONB')
      ? undefined
      : ast.binary(
          '#>',
          attribute.type.key === 'JSON'
            ? { kind: 'cast', expr: ast.ident(alias, attribute.field), type: 'JSONB' }
            : ast.ident(alias, attribute.field),
          ast.param(path),
        );
  }

  static #columnFor(definition: ModelDefinition, alias: string, name: string): ExprNode {
    const attribute = definition.attributes.get(name);
    const column = ast.ident(alias, attribute?.field ?? name);
    return attribute === undefined || attribute.field === name
      ? column
      : { kind: 'alias', expr: column, alias: name };
  }
}
