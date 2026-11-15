import { SqlExpression } from '../expressions/methods.ts';
import { Op } from '../expressions/op.ts';
import { SqlAst, type ExprNode } from '../sql/ast.ts';
import { CONTAINMENT_OPERATORS } from './operator-allowlist.ts';
import {
  isPlainObject,
  jsonbAt,
  serializeWith,
  withCast,
  type ExprConverter,
  type JsonAccess,
  type Operand,
} from './where-support.ts';

const ast = new SqlAst();

const DEFAULT_IN_AS_ANY_THRESHOLD = 100;

const jsonCastFor = (value: unknown): string | undefined =>
  typeof value === 'number'
    ? 'double precision'
    : typeof value === 'boolean'
      ? 'boolean'
      : undefined;

const quantifierOf = (value: unknown): 'ANY' | 'ALL' | undefined =>
  isPlainObject(value)
    ? Op.any in value
      ? 'ANY'
      : Op.all in value
        ? 'ALL'
        : undefined
    : undefined;

const likePattern = (prefix: string, value: unknown, suffix: string): unknown =>
  value instanceof SqlExpression ? value : `${prefix}${String(value)}${suffix}`;

const pairOf = (value: unknown): readonly [unknown, unknown] => {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error('Op.between / Op.notBetween expects an array of two values');
  }
  return [value[0], value[1]];
};

/** `IS NULL` / `IS NOT NULL`. */
export const nullCheck = (left: Operand, negated: boolean): ExprNode => ({
  kind: 'postfix',
  op: negated ? 'IS NOT NULL' : 'IS NULL',
  expr: left.node,
});

/** True for the values accepted by `Op.is`. */
export const isNullOrBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === 'boolean';

/** `IS [NOT] NULL|TRUE|FALSE`. */
export const isCheck = (left: Operand, value: boolean | null, negated: boolean): ExprNode => ({
  kind: 'postfix',
  op: `${negated ? 'IS NOT' : 'IS'} ${value === null ? 'NULL' : String(value).toUpperCase()}`,
  expr: left.node,
});

/** `Op.is`: `IS NULL|TRUE|FALSE`. */
export const isOperator = (left: Operand, value: unknown): ExprNode => {
  if (!isNullOrBoolean(value)) {
    throw new Error('Op.is expects null, true or false');
  }
  return isCheck(left, value, false);
};

/**
 * Value comparisons: binary operators with `ANY` / `ALL` quantifiers, `IN` lists (as `= ANY` above
 * the threshold), `BETWEEN`, the `LIKE` shortcuts and jsonb operators on JSON paths.
 */
export class ComparisonCompiler {
  /** `left <sqlOp> value`, with `ANY` / `ALL` quantifiers and JSON value casts. */
  comparison(compiler: ExprConverter, sqlOp: string, left: Operand, value: unknown): ExprNode {
    const quantifier = quantifierOf(value);
    if (quantifier !== undefined && isPlainObject(value)) {
      const items = value[quantifier === 'ANY' ? Op.any : Op.all];
      return ast.binary(
        sqlOp,
        left.node,
        ast.fnCall(quantifier, [this.#quantifiedOperand(compiler, left, items)]),
      );
    }
    const operand = left.json === undefined ? left : withCast(left, jsonCastFor(value));
    return ast.binary(sqlOp, operand.node, this.#valueNode(compiler, left, value));
  }

  /** `Op.startsWith` / `Op.endsWith` / `Op.substring` as `LIKE`. */
  pattern(compiler: ExprConverter, op: symbol, left: Operand, value: unknown): ExprNode {
    const prefix = op === Op.startsWith ? '' : '%';
    const suffix = op === Op.endsWith ? '' : '%';
    return this.comparison(compiler, 'LIKE', left, likePattern(prefix, value, suffix));
  }

  /** `[NOT] IN`; empty lists become `FALSE` / `TRUE`, long lists `= ANY($n)` / `<> ALL($n)`. */
  inList(compiler: ExprConverter, left: Operand, value: unknown, negated: boolean): ExprNode {
    if (value instanceof SqlExpression) {
      return ast.binary(negated ? 'NOT IN' : 'IN', left.node, compiler.toExpr(value));
    }
    const items: readonly unknown[] = Array.isArray(value) ? value : [value];
    if (items.length === 0) {
      return ast.raw(negated ? 'TRUE' : 'FALSE');
    }
    if (items.length > (compiler.context.inAsAnyThreshold ?? DEFAULT_IN_AS_ANY_THRESHOLD)) {
      return this.#inAsArray(left, items, negated);
    }
    return ast.binary(negated ? 'NOT IN' : 'IN', left.node, {
      kind: 'list',
      items: items.map((item) => compiler.toExpr(item, left.ref)),
    });
  }

  /** `[NOT] BETWEEN low AND high`. */
  between(compiler: ExprConverter, left: Operand, value: unknown, negated: boolean): ExprNode {
    const [low, high] = pairOf(value);
    return {
      kind: 'between',
      expr: left.node,
      low: compiler.toExpr(low, left.ref),
      high: compiler.toExpr(high, left.ref),
      negated,
    };
  }

  /** jsonb key existence / containment operator on the jsonb value at a JSON path (`#>`). */
  jsonb(
    compiler: ExprConverter,
    sqlOp: string,
    op: symbol,
    json: JsonAccess,
    value: unknown,
  ): ExprNode {
    return ast.binary(
      sqlOp,
      jsonbAt(json),
      CONTAINMENT_OPERATORS.has(op) && !(value instanceof SqlExpression)
        ? ast.param(JSON.stringify(value))
        : compiler.toExpr(value),
    );
  }

  #inAsArray(left: Operand, items: readonly unknown[], negated: boolean): ExprNode {
    return ast.binary(
      negated ? '<>' : '=',
      left.node,
      ast.fnCall(negated ? 'ALL' : 'ANY', [
        ast.param(items.map((item) => serializeWith(left.ref, item))),
      ]),
    );
  }

  #valueNode(compiler: ExprConverter, left: Operand, value: unknown): ExprNode {
    return left.json !== undefined && !(value instanceof SqlExpression)
      ? ast.param(
          typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
        )
      : compiler.toExpr(value, left.ref);
  }

  #quantifiedOperand(compiler: ExprConverter, left: Operand, items: unknown): ExprNode {
    return isPlainObject(items) && Array.isArray(items[Op.values])
      ? {
          kind: 'values',
          rows: (items[Op.values] as readonly unknown[]).map((item) => [
            compiler.toExpr(item, left.ref),
          ]),
        }
      : ast.param(
          Array.isArray(items) ? items.map((item) => serializeWith(left.ref, item)) : items,
        );
  }
}
