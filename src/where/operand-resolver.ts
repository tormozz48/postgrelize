import { SqlAst, type ExprNode } from '../sql/ast.ts';
import { validCastType } from './operator-allowlist.ts';
import {
  columnPath,
  jsonOperand,
  withCast,
  type Operand,
  type WhereContext,
} from './where-support.ts';

const ast = new SqlAst();

// v6 `_getSafeKey`: `$user.agent.id$` addresses the include alias `user->agent`, not three identifiers.
const nestedAlias = (path: string): string => {
  const parts = path.split('.');
  return parts.length > 2 ? `${parts.slice(0, -1).join('->')}.${parts.at(-1)}` : path;
};

/**
 * Resolves a where key into its left-hand operand: `$table.column$` paths, attribute names mapped
 * to columns, `attr.a.b` JSON paths and `attr::type` casts.
 */
export class OperandResolver {
  /** Operand of a where key. */
  operand(context: WhereContext, key: string): Operand {
    if (key.startsWith('$') && key.endsWith('$')) {
      return { node: columnPath(nestedAlias(key.slice(1, -1))) };
    }
    const [name = key, castType] = key.split('::');
    const [attribute = name, ...path] = name.split('.');
    const ref = context.resolve(attribute);
    const column = this.#column(context, ref?.field ?? attribute);
    const operand: Operand =
      path.length > 0
        ? jsonOperand({ base: column, path })
        : ref === undefined
          ? { node: column }
          : { node: column, ref };
    return withCast(operand, castType === undefined ? undefined : validCastType(castType));
  }

  #column(context: WhereContext, field: string): ExprNode {
    const tableAlias = context.tableAlias;
    return tableAlias === undefined ? ast.ident(field) : ast.ident(tableAlias, field);
  }
}
