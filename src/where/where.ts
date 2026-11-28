import { SqlAst, type ExprNode } from '../sql/ast.ts';
import {
  SqlExpression,
  type Case,
  type Cast,
  type Col,
  type Excluded,
  type Exists,
  type Fn,
  type Json,
  type Literal,
  type Over,
  type SqlExpressionVisitor,
  type Subquery,
  type Tuple,
  type Where,
} from '../expressions/methods.ts';
import { Op } from '../expressions/op.ts';
import { CaseCompiler } from './case-compiler.ts';
import { ComparisonCompiler } from './comparison-compiler.ts';
import { ConditionCompiler } from './condition-compiler.ts';
import { OperandResolver } from './operand-resolver.ts';
import { validComparator } from './operator-allowlist.ts';
import { WindowCompiler } from './window-compiler.ts';
import {
  inlineLiteral,
  isOpKey,
  nestedColumnPath,
  isPlainObject,
  ownKeys,
  serializeWith,
  type AttributeRef,
  type Operand,
  type WhereContext,
} from './where-support.ts';

export type { AttributeRef, WhereContext } from './where-support.ts';

const INT4_MAX = 2_147_483_647;
const ast = new SqlAst();

const splitConditions = (value: unknown): readonly unknown[] =>
  Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? ownKeys(value).map((key) => ({ [key]: value[key] }))
      : [value];

// The collaborators are stateless (the compiler is passed in) and shared by every compiler: a
// compiler is created per query, so it allocates nothing beyond itself.
const operands = new OperandResolver();
const conditions = new ConditionCompiler(new ComparisonCompiler());
const windows = new WindowCompiler(operands);
const cases = new CaseCompiler();

/**
 * Compiles Sequelize v6 `where` / `having` values and expression builders into AST nodes.
 * Attribute names are resolved through the injected {@link WhereContext}; one instance can be
 * reused for any number of conditions over the same context.
 */
export class WhereCompiler implements SqlExpressionVisitor<ExprNode> {
  /** Attribute resolver, table alias and options. */
  readonly context: WhereContext;

  /**
   * @param context - Attribute resolver, table alias and options.
   */
  constructor(context: WhereContext) {
    this.context = context;
  }

  /** True when a where value has no conditions. */
  static isEmpty(where: unknown): boolean {
    return (
      where === undefined ||
      where === null ||
      (isPlainObject(where) && ownKeys(where).length === 0) ||
      (Array.isArray(where) && where.length === 0)
    );
  }

  /** True for the `where` shapes the writers accept: plain object, array or expression builder. */
  static isConditions(where: unknown): boolean {
    return where instanceof SqlExpression || Array.isArray(where) || isPlainObject(where);
  }

  /** Compiles a Sequelize v6 `where` value (object, array or expression) into an AST condition. */
  compile(where: unknown): ExprNode {
    if (where instanceof SqlExpression) {
      return where.accept(this);
    }
    if (Array.isArray(where)) {
      return ast.and(where.map((item: unknown) => this.#arrayItem(item)));
    }
    if (typeof where === 'number' || typeof where === 'bigint') {
      // like v6: a bare number filters the first primary key
      return this.compile({ [this.context.primaryKey ?? 'id']: where });
    }
    if (typeof where === 'string') {
      throw new Error("Support for `{where: 'raw query'}` has been removed.");
    }
    if (!isPlainObject(where)) {
      throw new Error(`Invalid where value: ${String(where)}`);
    }
    return ast.and(ownKeys(where).map((key) => this.#entry(where, key)));
  }

  #arrayItem(item: unknown): ExprNode {
    if (typeof item === 'string') {
      throw new Error('Support for literal replacements in the `where` object has been removed.');
    }
    return this.compile(item);
  }

  #entry(where: Readonly<Record<string | symbol, unknown>>, key: string | symbol): ExprNode {
    if (isOpKey(key)) {
      return this.#topLevelOperator(key, where[key]);
    }
    if (where[key] === undefined) {
      // like v6: an undefined value is a mistake (a missing variable), not "no condition"
      throw new Error(`WHERE parameter "${String(key)}" has invalid "undefined" value`);
    }
    return conditions.condition(this, operands.operand(this.context, key), where[key]);
  }

  /** Converts an expression builder or a plain value (bound as a parameter) into an AST node. */
  toExpr(value: unknown, ref?: AttributeRef): ExprNode {
    if (value instanceof SqlExpression) {
      return value.accept(this);
    }
    const bound = serializeWith(ref, value);
    const param = ast.param(bound);
    if (ref?.castType !== undefined) {
      return { kind: 'cast', expr: param, type: ref.castType };
    }
    // v6 writes the number into the SQL, so `id = 99999999999` is false; a bound parameter would be typed as the column (int4) and fail
    return typeof bound === 'number' && Number.isSafeInteger(bound) && Math.abs(bound) > INT4_MAX
      ? { kind: 'cast', expr: param, type: 'bigint' }
      : param;
  }

  /** @internal */
  visitLiteral(value: Literal): ExprNode {
    // v6 accepts `literal(2020)`; a number must not reach the compiler as a segment
    return ast.raw(String(value.val));
  }

  /** @internal */
  visitFn(value: Fn): ExprNode {
    return ast.fnCall(
      value.fn,
      value.args.map((arg) =>
        value.inlineStrings && typeof arg === 'string' ? inlineLiteral(arg) : this.toExpr(arg),
      ),
    );
  }

  /** @internal */
  visitCol(value: Col): ExprNode {
    return typeof value.col === 'string' ? nestedColumnPath(value.col) : ast.ident(...value.col);
  }

  /** @internal */
  visitCast(value: Cast): ExprNode {
    return { kind: 'cast', expr: this.toExpr(value.val), type: value.type };
  }

  /** @internal */
  visitJson(value: Json): ExprNode {
    if (value.conditions !== undefined) {
      return this.compile(value.conditions);
    }
    // like v6 (`_.toPath`), `a.list[0].name` reads the array element
    const path = (value.path ?? '').replace(/\[(\w+)\]/g, '.$1');
    const accessor = operands.operand(this.context, path).node;
    return value.value === undefined ? accessor : ast.binary('=', accessor, ast.param(value.value));
  }

  /** @internal */
  visitWhere(value: Where): ExprNode {
    const left: Operand = { node: this.toExpr(value.attribute) };
    if (typeof value.comparator === 'symbol') {
      return conditions.operator(this, value.comparator, left, value.logic);
    }
    return value.comparator === '='
      ? conditions.condition(this, left, value.logic)
      : ast.binary(validComparator(value.comparator), left.node, this.toExpr(value.logic));
  }

  /** @internal */
  visitSubquery(value: Subquery): ExprNode {
    return { kind: 'subquery', query: value.build() };
  }

  /** @internal */
  visitExists(value: Exists): ExprNode {
    return {
      kind: 'prefix',
      op: value.negated ? 'NOT EXISTS' : 'EXISTS',
      expr: { kind: 'subquery', query: value.subquery.build() },
    };
  }

  /** @internal */
  visitTuple(value: Tuple): ExprNode {
    return { kind: 'list', items: value.items.map((item) => this.toExpr(item)) };
  }

  /** @internal */
  visitOver(value: Over): ExprNode {
    return windows.over(this, value);
  }

  /** @internal */
  visitCase(value: Case): ExprNode {
    return cases.case(this, value);
  }

  /** @internal */
  visitExcluded(value: Excluded): ExprNode {
    if (this.context.allowExcluded !== true) {
      throw new Error('excluded() can only be used inside onConflict');
    }
    return { kind: 'excluded', column: this.context.resolve(value.column)?.field ?? value.column };
  }

  #topLevelOperator(op: symbol, value: unknown): ExprNode {
    switch (op) {
      case Op.and:
        return ast.and(splitConditions(value).map((item) => this.compile(item)));
      case Op.or:
        return ast.or(splitConditions(value).map((item) => this.compile(item)));
      case Op.not:
        return { kind: 'prefix', op: 'NOT', expr: this.compile(value) };
      default:
        throw new Error(`Invalid top-level where operator: ${String(op)}`);
    }
  }
}
