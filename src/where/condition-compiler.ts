import { Op } from '../expressions/op.ts';
import { SqlAst, type ExprNode } from '../sql/ast.ts';
import {
  isCheck,
  isNullOrBoolean,
  isOperator,
  nullCheck,
  type ComparisonCompiler,
} from './comparison-compiler.ts';
import {
  binaryOps,
  CONTAINMENT_OPERATORS,
  KEY_OPERATORS,
  operatorFamilies,
} from './operator-allowlist.ts';
import {
  columnPath,
  hasOpKeys,
  isOpKey,
  isPlainObject,
  jsonOperand,
  ownKeys,
  type Conditions,
  type ExprConverter,
  type JsonAccess,
  type Operand,
} from './where-support.ts';

const ast = new SqlAst();

/**
 * Compiles the value of one attribute condition (`{ attr: value }`): plain values, `Op.*` objects,
 * nested JSON conditions and the logical combinators applied to the same attribute.
 */
export class ConditionCompiler {
  readonly #comparisons: ComparisonCompiler;

  /**
   * @param comparisons - Value comparisons.
   */
  constructor(comparisons: ComparisonCompiler) {
    this.#comparisons = comparisons;
  }

  /** Condition of `left` against a where value (plain value, array, `Op.*` object, JSON object). */
  condition(compiler: ExprConverter, left: Operand, value: unknown): ExprNode {
    if (isPlainObject(value)) {
      if (hasOpKeys(value)) {
        return ast.and(
          ownKeys(value)
            .filter(isOpKey)
            .map((op) => this.operator(compiler, op, left, value[op])),
        );
      }
      if (left.ref?.isJson === true || left.json !== undefined) {
        return this.#jsonNested(compiler, left, value);
      }
    }
    if (Array.isArray(value) && left.ref?.isJson !== true) {
      return this.#comparisons.inList(compiler, left, value, false);
    }
    return this.#equals(compiler, left, value, false);
  }

  /** Applies one `Op.*` operator; only operators of the allowlist are accepted. */
  operator(compiler: ExprConverter, op: symbol, left: Operand, value: unknown): ExprNode {
    const sqlOp = binaryOps.get(op);
    if (sqlOp !== undefined) {
      return this.#binaryOperator(compiler, sqlOp, op, left, value);
    }
    switch (operatorFamilies.get(op)) {
      case 'equality':
        return this.#equality(compiler, op, left, value);
      case 'membership':
        return this.#membership(compiler, op, left, value);
      case 'pattern':
        return this.#comparisons.pattern(compiler, op, left, value);
      case 'logical':
        return this.#logical(compiler, op, left, value);
      case 'quantifier':
        return this.#comparisons.comparison(compiler, '=', left, { [op]: value });
      default:
        throw new Error(`Unsupported operator: ${String(op)}`);
    }
  }

  #binaryOperator(
    compiler: ExprConverter,
    sqlOp: string,
    op: symbol,
    left: Operand,
    value: unknown,
  ): ExprNode {
    if (left.json !== undefined && (KEY_OPERATORS.has(op) || CONTAINMENT_OPERATORS.has(op))) {
      return this.#comparisons.jsonb(compiler, sqlOp, op, left.json, value);
    }
    const operand = KEY_OPERATORS.has(op) ? { node: left.node } : left;
    return this.#comparisons.comparison(compiler, sqlOp, operand, value);
  }

  #equals(compiler: ExprConverter, left: Operand, value: unknown, negated: boolean): ExprNode {
    return value === null
      ? nullCheck(left, negated)
      : this.#comparisons.comparison(compiler, negated ? '<>' : '=', left, value);
  }

  #equality(compiler: ExprConverter, op: symbol, left: Operand, value: unknown): ExprNode {
    switch (op) {
      case Op.eq:
        return this.#equals(compiler, left, value, false);
      case Op.ne:
        return this.#equals(compiler, left, value, true);
      case Op.is:
        return isOperator(compiler, left, value);
      case Op.not:
        return this.#negation(compiler, left, value);
      default:
        return ast.binary('=', left.node, columnPath(String(value)));
    }
  }

  #membership(compiler: ExprConverter, op: symbol, left: Operand, value: unknown): ExprNode {
    switch (op) {
      case Op.in:
        return this.#comparisons.inList(compiler, left, value, false);
      case Op.notIn:
        return this.#comparisons.inList(compiler, left, value, true);
      case Op.between:
        return this.#comparisons.between(compiler, left, value, false);
      default:
        return this.#comparisons.between(compiler, left, value, true);
    }
  }

  #logical(compiler: ExprConverter, op: symbol, left: Operand, value: unknown): ExprNode {
    const items = (Array.isArray(value) ? value : [value]).map((item: unknown) =>
      this.condition(compiler, left, item),
    );
    return op === Op.and ? ast.and(items) : ast.or(items);
  }

  #negation(compiler: ExprConverter, left: Operand, value: unknown): ExprNode {
    return isNullOrBoolean(value)
      ? isCheck(left, value, true)
      : isPlainObject(value)
        ? { kind: 'prefix', op: 'NOT', expr: this.condition(compiler, left, value) }
        : this.#comparisons.comparison(compiler, '<>', left, value);
  }

  #jsonNested(compiler: ExprConverter, left: Operand, value: Conditions): ExprNode {
    const access: JsonAccess = left.json ?? { base: left.node, path: [] };
    return ast.and(
      Object.entries(value).map(([key, nested]) =>
        this.condition(
          compiler,
          jsonOperand({ base: access.base, path: [...access.path, key] }),
          nested,
        ),
      ),
    );
  }
}
