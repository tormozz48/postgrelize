import {
  SqlAst,
  type ExprNode,
  type FunctionSource,
  type JoinNode,
  type SelectNode,
} from '../sql/ast.ts';
import type { ModelDefinition } from './model-definition.ts';

const ast = new SqlAst();

/** Parent keys of a top-N-per-parent read: child rows whose `attribute` equals one of `values`. */
export type LateralKeys = Readonly<{ attribute: string; values: readonly unknown[] }>;

/**
 * Wraps the per-parent query in `FROM unnest(keys) JOIN LATERAL (query) ON TRUE`, so that `limit`
 * and `order` of the query apply to each key separately.
 */
export class LateralKeysBuilder {
  /**
   * Builds the outer SELECT.
   *
   * @param definition - Definition of the child model.
   * @param inner - Per-parent SELECT (with `limit` and `order`) without the key condition.
   * @param keys - Parent keys and the child attribute they match.
   * @param alias - Alias of the child rows.
   * @returns SELECT of every child row, grouped by key in key order.
   * @throws Error when the key attribute is not a stored attribute.
   */
  build(
    definition: ModelDefinition,
    inner: SelectNode,
    keys: LateralKeys,
    alias: string,
  ): SelectNode {
    const attribute = definition.attributes.get(keys.attribute);
    if (attribute === undefined) {
      throw new Error(`Unknown attribute for a lateral include: ${keys.attribute}`);
    }
    const where = LateralKeysBuilder.#where(inner, alias, attribute.field);
    return {
      kind: 'select',
      columns: [{ kind: 'star', table: alias }],
      from: LateralKeysBuilder.#keys(keys, attribute.type.sqlType),
      joins: [LateralKeysBuilder.#join({ ...inner, where }, alias)],
      orderBy: [{ expr: ast.ident('keys', 'position') }, ...(inner.orderBy ?? [])],
    };
  }

  static #join(inner: SelectNode, alias: string): JoinNode {
    return {
      type: 'INNER',
      table: { subquery: inner, alias, lateral: true },
      on: ast.raw('TRUE'),
    };
  }

  static #where(inner: SelectNode, alias: string, field: string): ExprNode {
    const correlated = ast.binary('=', ast.ident(alias, field), ast.ident('keys', 'key'));
    return inner.where === undefined ? correlated : ast.and([correlated, inner.where]);
  }

  static #keys(keys: LateralKeys, sqlType: string): FunctionSource {
    return {
      function: ['unnest'],
      args: [{ kind: 'cast', expr: ast.param(keys.values), type: `${sqlType}[]` }],
      alias: 'keys',
      columns: ['key', 'position'],
      ordinality: 'position',
    };
  }
}
