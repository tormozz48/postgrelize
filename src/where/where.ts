import { SqlAst, type ExprNode, type OrderNode } from '../sql/ast.ts';
import { OrderDirection } from '../sql/order.ts';
import {
  SqlExpression,
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

/** Attribute facts the where compiler needs; supplied by the model layer. */
export type AttributeRef = Readonly<{
  field: string;
  isJson?: boolean;
  serialize?: (value: unknown) => unknown;
}>;

/** Attribute resolver and options injected into a {@link WhereCompiler}. */
export type WhereContext = Readonly<{
  tableAlias?: string;
  resolve: (attribute: string) => AttributeRef | undefined;
  inAsAnyThreshold?: number;
  /** Allows `excluded()` (only inside `ON CONFLICT DO UPDATE`). */
  allowExcluded?: boolean;
}>;

type JsonAccess = Readonly<{ base: ExprNode; path: readonly string[] }>;

type Operand = Readonly<{ node: ExprNode; ref?: AttributeRef; json?: JsonAccess }>;

type Conditions = Readonly<Record<string | symbol, unknown>>;

const DEFAULT_IN_AS_ANY_THRESHOLD = 100;

const ast = new SqlAst();

const isPlainObject = (value: unknown): value is Conditions =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value) &&
  !(value instanceof SqlExpression);

const ownKeys = (value: object): readonly (string | symbol)[] => Reflect.ownKeys(value);

const isOpKey = (key: string | symbol): key is symbol => typeof key === 'symbol';

const hasOpKeys = (value: Conditions): boolean => ownKeys(value).some(isOpKey);

const columnPath = (path: string): ExprNode =>
  path === '*' ? { kind: 'star' } : ast.ident(...path.split('.'));

const serializeWith = (ref: AttributeRef | undefined, value: unknown): unknown =>
  ref?.serialize === undefined ? value : ref.serialize(value);

// The path is bound as a text[] parameter, so keys with `,`, `"` or a backslash need no escaping.
const jsonOperand = (json: JsonAccess): Operand => ({
  node: ast.binary('#>>', json.base, ast.param(json.path)),
  json,
});

/** jsonb value at the path of a JSON operand (`#>`), for jsonb operators. */
const jsonbAt = (json: JsonAccess): ExprNode => ast.binary('#>', json.base, ast.param(json.path));

const ALLOWED_CAST_TYPES: ReadonlySet<string> = new Set([
  'integer',
  'int',
  'smallint',
  'bigint',
  'float',
  'real',
  'double precision',
  'decimal',
  'numeric',
  'boolean',
  'text',
  'char',
  'varchar',
  'date',
  'timestamp',
  'timestamptz',
  'json',
  'jsonb',
  'uuid',
]);

const validCastType = (type: string): string => {
  if (!ALLOWED_CAST_TYPES.has(type.trim().toLowerCase())) {
    throw new Error(`Invalid cast type: ${type}`);
  }
  return type;
};

const SQL_COMPARATOR =
  /^(?:[=<>!~*@&|?#+\-/%^]{1,3}|(?:NOT\s+)?(?:I?LIKE|IN|SIMILAR\s+TO)|IS(?:\s+NOT)?(?:\s+DISTINCT\s+FROM)?)$/i;

const validComparator = (comparator: string): string => {
  if (!SQL_COMPARATOR.test(comparator.trim()) || /--|\/\*|\*\//.test(comparator)) {
    throw new Error(`Invalid comparator: ${comparator}`);
  }
  return comparator.trim();
};

const withCast = (operand: Operand, type: string | undefined): Operand =>
  type === undefined ? operand : { node: { kind: 'cast', expr: operand.node, type } };

const jsonCastFor = (value: unknown): string | undefined =>
  typeof value === 'number'
    ? 'double precision'
    : typeof value === 'boolean'
      ? 'boolean'
      : undefined;

const nullCheck = (left: Operand, negated: boolean): ExprNode => ({
  kind: 'postfix',
  op: negated ? 'IS NOT NULL' : 'IS NULL',
  expr: left.node,
});

const quantifierOf = (value: unknown): 'ANY' | 'ALL' | undefined =>
  isPlainObject(value)
    ? Op.any in value
      ? 'ANY'
      : Op.all in value
        ? 'ALL'
        : undefined
    : undefined;

const isNullOrBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === 'boolean';

const isCheck = (left: Operand, value: boolean | null, negated: boolean): ExprNode => ({
  kind: 'postfix',
  op: `${negated ? 'IS NOT' : 'IS'} ${value === null ? 'NULL' : String(value).toUpperCase()}`,
  expr: left.node,
});

const likePattern = (prefix: string, value: unknown, suffix: string): unknown =>
  value instanceof SqlExpression ? value : `${prefix}${String(value)}${suffix}`;

const pairOf = (value: unknown): readonly [unknown, unknown] => {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error('Op.between / Op.notBetween expects an array of two values');
  }
  return [value[0], value[1]];
};

const binaryOps: ReadonlyMap<symbol, string> = new Map<symbol, string>([
  [Op.gt, '>'],
  [Op.gte, '>='],
  [Op.lt, '<'],
  [Op.lte, '<='],
  [Op.like, 'LIKE'],
  [Op.notLike, 'NOT LIKE'],
  [Op.iLike, 'ILIKE'],
  [Op.notILike, 'NOT ILIKE'],
  [Op.regexp, '~'],
  [Op.notRegexp, '!~'],
  [Op.iRegexp, '~*'],
  [Op.notIRegexp, '!~*'],
  [Op.overlap, '&&'],
  [Op.contains, '@>'],
  [Op.contained, '<@'],
  [Op.adjacent, '-|-'],
  [Op.strictLeft, '<<'],
  [Op.strictRight, '>>'],
  [Op.noExtendRight, '&<'],
  [Op.noExtendLeft, '&>'],
  [Op.match, '@@'],
  [Op.isDistinctFrom, 'IS DISTINCT FROM'],
  [Op.isNotDistinctFrom, 'IS NOT DISTINCT FROM'],
  [Op.hasKey, '?'],
  [Op.hasAnyKeys, '?|'],
  [Op.hasAllKeys, '?&'],
]);

const KEY_OPERATORS: ReadonlySet<symbol> = new Set([Op.hasKey, Op.hasAnyKeys, Op.hasAllKeys]);

const CONTAINMENT_OPERATORS: ReadonlySet<symbol> = new Set([Op.contains, Op.contained]);

const splitConditions = (value: unknown): readonly unknown[] =>
  Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? ownKeys(value).map((key) => ({ [key]: value[key] }))
      : [value];

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

  /** Compiles a Sequelize v6 `where` value (object, array or expression) into an AST condition. */
  compile(where: unknown): ExprNode {
    if (where instanceof SqlExpression) {
      return where.accept(this);
    }
    if (Array.isArray(where)) {
      return ast.and(where.map((item: unknown) => this.compile(item)));
    }
    if (!isPlainObject(where)) {
      throw new Error(`Invalid where value: ${String(where)}`);
    }
    return ast.and(
      ownKeys(where).map((key) =>
        isOpKey(key)
          ? this.#topLevelOperator(key, where[key])
          : this.#attributeCondition(this.#attributeOperand(key), where[key]),
      ),
    );
  }

  /** Converts an expression builder or a plain value (bound as a parameter) into an AST node. */
  toExpr(value: unknown, ref?: AttributeRef): ExprNode {
    return value instanceof SqlExpression
      ? value.accept(this)
      : ast.param(serializeWith(ref, value));
  }

  /** @internal */
  visitLiteral(value: Literal): ExprNode {
    return ast.raw(value.val);
  }

  /** @internal */
  visitFn(value: Fn): ExprNode {
    return ast.fnCall(
      value.fn,
      value.args.map((arg) => this.toExpr(arg)),
    );
  }

  /** @internal */
  visitCol(value: Col): ExprNode {
    return typeof value.col === 'string' ? columnPath(value.col) : ast.ident(...value.col);
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
    const accessor = this.#attributeOperand(value.path ?? '').node;
    return value.value === undefined ? accessor : ast.binary('=', accessor, ast.param(value.value));
  }

  /** @internal */
  visitWhere(value: Where): ExprNode {
    const left: Operand = { node: this.toExpr(value.attribute) };
    if (typeof value.comparator === 'symbol') {
      return this.#applyOperator(value.comparator, left, value.logic);
    }
    return value.comparator === '='
      ? this.#attributeCondition(left, value.logic)
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
    return {
      kind: 'over',
      expr: this.toExpr(value.fn),
      partitionBy: value.partitionBy.map((item) => this.#windowTarget(item)),
      orderBy: value.orderBy.map((item) => this.#windowOrder(item)),
    };
  }

  /** @internal */
  visitExcluded(value: Excluded): ExprNode {
    if (this.context.allowExcluded !== true) {
      throw new Error('excluded() can only be used inside onConflict');
    }
    return { kind: 'excluded', column: this.context.resolve(value.column)?.field ?? value.column };
  }

  #windowTarget(item: unknown): ExprNode {
    return typeof item === 'string' ? this.#attributeOperand(item).node : this.toExpr(item);
  }

  #windowOrder(item: unknown): OrderNode {
    if (Array.isArray(item)) {
      const [target, direction]: readonly unknown[] = item;
      return {
        expr: this.#windowTarget(target),
        ...(direction === undefined ? {} : OrderDirection.parse(direction)),
      };
    }
    return { expr: this.#windowTarget(item) };
  }

  #attributeOperand(key: string): Operand {
    if (key.startsWith('$') && key.endsWith('$')) {
      return { node: columnPath(key.slice(1, -1)) };
    }
    const [name = key, castType] = key.split('::');
    const [attribute = name, ...path] = name.split('.');
    const ref = this.context.resolve(attribute);
    const field = ref?.field ?? attribute;
    const tableAlias = this.context.tableAlias;
    const column = tableAlias === undefined ? ast.ident(field) : ast.ident(tableAlias, field);
    const operand: Operand =
      path.length > 0
        ? jsonOperand({ base: column, path })
        : ref === undefined
          ? { node: column }
          : { node: column, ref };
    return withCast(operand, castType === undefined ? undefined : validCastType(castType));
  }

  #valueNode(left: Operand, value: unknown): ExprNode {
    return left.json !== undefined && !(value instanceof SqlExpression)
      ? ast.param(
          typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
        )
      : this.toExpr(value, left.ref);
  }

  #quantifiedOperand(left: Operand, items: unknown): ExprNode {
    return isPlainObject(items) && Array.isArray(items[Op.values])
      ? {
          kind: 'values',
          rows: (items[Op.values] as readonly unknown[]).map((item) => [
            this.toExpr(item, left.ref),
          ]),
        }
      : ast.param(
          Array.isArray(items) ? items.map((item) => serializeWith(left.ref, item)) : items,
        );
  }

  #comparison(sqlOp: string, left: Operand, value: unknown): ExprNode {
    const quantifier = quantifierOf(value);
    if (quantifier !== undefined && isPlainObject(value)) {
      const items = value[quantifier === 'ANY' ? Op.any : Op.all];
      return ast.binary(
        sqlOp,
        left.node,
        ast.fnCall(quantifier, [this.#quantifiedOperand(left, items)]),
      );
    }
    const operand = left.json === undefined ? left : withCast(left, jsonCastFor(value));
    return ast.binary(sqlOp, operand.node, this.#valueNode(left, value));
  }

  #inList(left: Operand, value: unknown, negated: boolean): ExprNode {
    if (value instanceof SqlExpression) {
      return ast.binary(negated ? 'NOT IN' : 'IN', left.node, this.toExpr(value));
    }
    const items: readonly unknown[] = Array.isArray(value) ? value : [value];
    if (items.length === 0) {
      return ast.raw(negated ? 'TRUE' : 'FALSE');
    }
    if (items.length > (this.context.inAsAnyThreshold ?? DEFAULT_IN_AS_ANY_THRESHOLD)) {
      return ast.binary(
        negated ? '<>' : '=',
        left.node,
        ast.fnCall(negated ? 'ALL' : 'ANY', [
          ast.param(items.map((item) => serializeWith(left.ref, item))),
        ]),
      );
    }
    return ast.binary(negated ? 'NOT IN' : 'IN', left.node, {
      kind: 'list',
      items: items.map((item) => this.toExpr(item, left.ref)),
    });
  }

  #between(left: Operand, value: unknown, negated: boolean): ExprNode {
    const [low, high] = pairOf(value);
    return {
      kind: 'between',
      expr: left.node,
      low: this.toExpr(low, left.ref),
      high: this.toExpr(high, left.ref),
      negated,
    };
  }

  #logical(op: symbol, left: Operand, value: unknown): ExprNode {
    const items = (Array.isArray(value) ? value : [value]).map((item: unknown) =>
      this.#attributeCondition(left, item),
    );
    return op === Op.and ? ast.and(items) : ast.or(items);
  }

  #negation(left: Operand, value: unknown): ExprNode {
    return isNullOrBoolean(value)
      ? isCheck(left, value, true)
      : isPlainObject(value)
        ? { kind: 'prefix', op: 'NOT', expr: this.#attributeCondition(left, value) }
        : this.#comparison('<>', left, value);
  }

  #jsonbOperator(sqlOp: string, op: symbol, json: JsonAccess, value: unknown): ExprNode {
    return ast.binary(
      sqlOp,
      jsonbAt(json),
      CONTAINMENT_OPERATORS.has(op) && !(value instanceof SqlExpression)
        ? ast.param(JSON.stringify(value))
        : this.toExpr(value),
    );
  }

  #applyOperator(op: symbol, left: Operand, value: unknown): ExprNode {
    const sqlOp = binaryOps.get(op);
    if (
      sqlOp !== undefined &&
      left.json !== undefined &&
      (KEY_OPERATORS.has(op) || CONTAINMENT_OPERATORS.has(op))
    ) {
      return this.#jsonbOperator(sqlOp, op, left.json, value);
    }
    if (sqlOp !== undefined) {
      return this.#comparison(sqlOp, KEY_OPERATORS.has(op) ? { node: left.node } : left, value);
    }
    switch (op) {
      case Op.eq:
        return value === null ? nullCheck(left, false) : this.#comparison('=', left, value);
      case Op.ne:
        return value === null ? nullCheck(left, true) : this.#comparison('<>', left, value);
      case Op.is:
        if (!isNullOrBoolean(value)) {
          throw new Error('Op.is expects null, true or false');
        }
        return isCheck(left, value, false);
      case Op.not:
        return this.#negation(left, value);
      case Op.in:
        return this.#inList(left, value, false);
      case Op.notIn:
        return this.#inList(left, value, true);
      case Op.startsWith:
        return this.#comparison('LIKE', left, likePattern('', value, '%'));
      case Op.endsWith:
        return this.#comparison('LIKE', left, likePattern('%', value, ''));
      case Op.substring:
        return this.#comparison('LIKE', left, likePattern('%', value, '%'));
      case Op.between:
        return this.#between(left, value, false);
      case Op.notBetween:
        return this.#between(left, value, true);
      case Op.col:
        return ast.binary('=', left.node, columnPath(String(value)));
      case Op.and:
      case Op.or:
        return this.#logical(op, left, value);
      case Op.any:
      case Op.all:
        return this.#comparison('=', left, { [op]: value });
      default:
        throw new Error(`Unsupported operator: ${String(op)}`);
    }
  }

  #jsonNested(left: Operand, value: Conditions): ExprNode {
    const access: JsonAccess = left.json ?? { base: left.node, path: [] };
    return ast.and(
      Object.entries(value).map(([key, nested]) =>
        this.#attributeCondition(
          jsonOperand({ base: access.base, path: [...access.path, key] }),
          nested,
        ),
      ),
    );
  }

  #attributeCondition(left: Operand, value: unknown): ExprNode {
    if (isPlainObject(value)) {
      if (hasOpKeys(value)) {
        return ast.and(
          ownKeys(value)
            .filter(isOpKey)
            .map((op) => this.#applyOperator(op, left, value[op])),
        );
      }
      if (left.ref?.isJson === true || left.json !== undefined) {
        return this.#jsonNested(left, value);
      }
    }
    if (Array.isArray(value) && left.ref?.isJson !== true) {
      return this.#inList(left, value, false);
    }
    return value === null ? nullCheck(left, false) : this.#comparison('=', left, value);
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
