import { and, binary, fnCall, ident, or, param, raw, type ExprNode } from '../sql/ast.ts';
import { isExpression, methodKind, type SqlExpression } from '../expressions/methods.ts';
import { Op } from '../expressions/op.ts';

/** Attribute facts the where compiler needs; supplied by the model layer. */
export type AttributeRef = Readonly<{
  field: string;
  isJson?: boolean;
  serialize?: (value: unknown) => unknown;
}>;

export type WhereContext = Readonly<{
  tableAlias?: string;
  resolve: (attribute: string) => AttributeRef | undefined;
  inAsAnyThreshold?: number;
}>;

type JsonAccess = Readonly<{ base: ExprNode; path: readonly string[] }>;

type Operand = Readonly<{ node: ExprNode; ref?: AttributeRef; json?: JsonAccess }>;

type Conditions = Readonly<Record<string | symbol, unknown>>;

const DEFAULT_IN_AS_ANY_THRESHOLD = 100;

const isPlainObject = (value: unknown): value is Conditions =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value) &&
  !isExpression(value);

const ownKeys = (value: object): readonly (string | symbol)[] => Reflect.ownKeys(value);

const isOpKey = (key: string | symbol): key is symbol => typeof key === 'symbol';

const hasOpKeys = (value: Conditions): boolean => ownKeys(value).some(isOpKey);

const columnPath = (path: string): ExprNode =>
  path === '*' ? { kind: 'star' } : ident(...path.split('.'));

const serializeWith = (ref: AttributeRef | undefined, value: unknown): unknown =>
  ref?.serialize === undefined ? value : ref.serialize(value);

const jsonOperand = (json: JsonAccess): Operand => ({
  node: binary('#>>', json.base, param(`{${json.path.join(',')}}`)),
  json,
});

/** Converts an expression builder or a plain value into an AST node. */
export const toExpr = (value: unknown, ctx: WhereContext, ref?: AttributeRef): ExprNode =>
  isExpression(value) ? expressionToAst(value, ctx) : param(serializeWith(ref, value));

const expressionToAst = (value: SqlExpression, ctx: WhereContext): ExprNode => {
  switch (value[methodKind]) {
    case 'literal':
      return raw(value.val);
    case 'fn':
      return fnCall(
        value.fn,
        value.args.map((arg) => toExpr(arg, ctx)),
      );
    case 'col':
      return typeof value.col === 'string' ? columnPath(value.col) : ident(...value.col);
    case 'cast':
      return { kind: 'cast', expr: toExpr(value.val, ctx), type: value.type };
    case 'json':
      return value.conditions === undefined
        ? jsonPathExpression(value.path ?? '', value, ctx)
        : whereToAst(value.conditions, ctx);
    case 'where':
      return expressionCondition(value, ctx);
    case 'excluded':
      return { kind: 'excluded', column: ctx.resolve(value.column)?.field ?? value.column };
  }
};

const jsonPathExpression = (
  path: string,
  value: Readonly<{ value?: unknown }>,
  ctx: WhereContext,
): ExprNode => {
  const accessor = attributeOperand(path, ctx).node;
  return 'value' in value ? binary('=', accessor, param(value.value)) : accessor;
};

const expressionCondition = (
  value: Extract<SqlExpression, { comparator: unknown }>,
  ctx: WhereContext,
): ExprNode => {
  const left: Operand = { node: toExpr(value.attribute, ctx) };
  if (typeof value.comparator === 'symbol') {
    return applyOperator(value.comparator, left, value.logic, ctx);
  }
  return value.comparator === '='
    ? attributeCondition(left, value.logic, ctx)
    : binary(value.comparator, left.node, toExpr(value.logic, ctx));
};

const withCast = (operand: Operand, type: string | undefined): Operand =>
  type === undefined ? operand : { node: { kind: 'cast', expr: operand.node, type } };

const attributeOperand = (key: string, ctx: WhereContext): Operand => {
  if (key.startsWith('$') && key.endsWith('$')) {
    return { node: columnPath(key.slice(1, -1)) };
  }
  const [name = key, castType] = key.split('::');
  const [attribute = name, ...path] = name.split('.');
  const ref = ctx.resolve(attribute);
  const field = ref?.field ?? attribute;
  const column = ctx.tableAlias === undefined ? ident(field) : ident(ctx.tableAlias, field);
  const operand: Operand =
    path.length > 0
      ? jsonOperand({ base: column, path })
      : ref === undefined
        ? { node: column }
        : { node: column, ref };
  return withCast(operand, castType);
};

const jsonCastFor = (value: unknown): string | undefined =>
  typeof value === 'number'
    ? 'double precision'
    : typeof value === 'boolean'
      ? 'boolean'
      : undefined;

const valueNode = (left: Operand, value: unknown, ctx: WhereContext): ExprNode =>
  left.json !== undefined && !isExpression(value)
    ? param(typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value))
    : toExpr(value, ctx, left.ref);

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

const quantifiedOperand = (left: Operand, items: unknown, ctx: WhereContext): ExprNode =>
  isPlainObject(items) && Array.isArray(items[Op.values])
    ? {
        kind: 'values',
        rows: (items[Op.values] as readonly unknown[]).map((item) => [toExpr(item, ctx, left.ref)]),
      }
    : param(Array.isArray(items) ? items.map((item) => serializeWith(left.ref, item)) : items);

const comparison = (sqlOp: string, left: Operand, value: unknown, ctx: WhereContext): ExprNode => {
  const quantifier = quantifierOf(value);
  if (quantifier !== undefined && isPlainObject(value)) {
    const items = value[quantifier === 'ANY' ? Op.any : Op.all];
    return binary(sqlOp, left.node, fnCall(quantifier, [quantifiedOperand(left, items, ctx)]));
  }
  const operand = left.json === undefined ? left : withCast(left, jsonCastFor(value));
  return binary(sqlOp, operand.node, valueNode(left, value, ctx));
};

const inList = (left: Operand, value: unknown, negated: boolean, ctx: WhereContext): ExprNode => {
  if (isExpression(value)) {
    return binary(negated ? 'NOT IN' : 'IN', left.node, toExpr(value, ctx));
  }
  const items: readonly unknown[] = Array.isArray(value) ? value : [value];
  if (items.length === 0) {
    return raw(negated ? 'TRUE' : 'FALSE');
  }
  if (items.length > (ctx.inAsAnyThreshold ?? DEFAULT_IN_AS_ANY_THRESHOLD)) {
    return binary(
      negated ? '<>' : '=',
      left.node,
      fnCall(negated ? 'ALL' : 'ANY', [param(items.map((item) => serializeWith(left.ref, item)))]),
    );
  }
  return binary(negated ? 'NOT IN' : 'IN', left.node, {
    kind: 'list',
    items: items.map((item) => toExpr(item, ctx, left.ref)),
  });
};

const isNullOrBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === 'boolean';

const isCheck = (left: Operand, value: boolean | null, negated: boolean): ExprNode => ({
  kind: 'postfix',
  op: `${negated ? 'IS NOT' : 'IS'} ${value === null ? 'NULL' : String(value).toUpperCase()}`,
  expr: left.node,
});

const likePattern = (prefix: string, value: unknown, suffix: string): unknown =>
  isExpression(value) ? value : `${prefix}${String(value)}${suffix}`;

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

const between = (left: Operand, value: unknown, negated: boolean, ctx: WhereContext): ExprNode => {
  const [low, high] = pairOf(value);
  return {
    kind: 'between',
    expr: left.node,
    low: toExpr(low, ctx, left.ref),
    high: toExpr(high, ctx, left.ref),
    negated,
  };
};

const logical = (op: symbol, left: Operand, value: unknown, ctx: WhereContext): ExprNode => {
  const items = (Array.isArray(value) ? value : [value]).map((item: unknown) =>
    attributeCondition(left, item, ctx),
  );
  return op === Op.and ? and(items) : or(items);
};

const negation = (left: Operand, value: unknown, ctx: WhereContext): ExprNode =>
  isNullOrBoolean(value)
    ? isCheck(left, value, true)
    : isPlainObject(value)
      ? { kind: 'prefix', op: 'NOT', expr: attributeCondition(left, value, ctx) }
      : comparison('<>', left, value, ctx);

const KEY_OPERATORS: ReadonlySet<symbol> = new Set([Op.hasKey, Op.hasAnyKeys, Op.hasAllKeys]);

const applyOperator = (op: symbol, left: Operand, value: unknown, ctx: WhereContext): ExprNode => {
  const sqlOp = binaryOps.get(op);
  if (sqlOp !== undefined) {
    return comparison(sqlOp, KEY_OPERATORS.has(op) ? { node: left.node } : left, value, ctx);
  }
  switch (op) {
    case Op.eq:
      return value === null ? nullCheck(left, false) : comparison('=', left, value, ctx);
    case Op.ne:
      return value === null ? nullCheck(left, true) : comparison('<>', left, value, ctx);
    case Op.is:
      if (!isNullOrBoolean(value)) {
        throw new Error('Op.is expects null, true or false');
      }
      return isCheck(left, value, false);
    case Op.not:
      return negation(left, value, ctx);
    case Op.in:
      return inList(left, value, false, ctx);
    case Op.notIn:
      return inList(left, value, true, ctx);
    case Op.startsWith:
      return comparison('LIKE', left, likePattern('', value, '%'), ctx);
    case Op.endsWith:
      return comparison('LIKE', left, likePattern('%', value, ''), ctx);
    case Op.substring:
      return comparison('LIKE', left, likePattern('%', value, '%'), ctx);
    case Op.between:
      return between(left, value, false, ctx);
    case Op.notBetween:
      return between(left, value, true, ctx);
    case Op.col:
      return binary('=', left.node, columnPath(String(value)));
    case Op.and:
    case Op.or:
      return logical(op, left, value, ctx);
    default:
      throw new Error(`Unsupported operator: ${String(op)}`);
  }
};

const jsonNested = (left: Operand, value: Conditions, ctx: WhereContext): ExprNode => {
  const access: JsonAccess = left.json ?? { base: left.node, path: [] };
  return and(
    Object.entries(value).map(([key, nested]) =>
      attributeCondition(
        jsonOperand({ base: access.base, path: [...access.path, key] }),
        nested,
        ctx,
      ),
    ),
  );
};

const attributeCondition = (left: Operand, value: unknown, ctx: WhereContext): ExprNode => {
  if (isPlainObject(value)) {
    if (hasOpKeys(value)) {
      return and(
        ownKeys(value)
          .filter(isOpKey)
          .map((op) => applyOperator(op, left, value[op], ctx)),
      );
    }
    if (left.ref?.isJson === true || left.json !== undefined) {
      return jsonNested(left, value, ctx);
    }
  }
  if (Array.isArray(value) && left.ref?.isJson !== true) {
    return inList(left, value, false, ctx);
  }
  return value === null ? nullCheck(left, false) : comparison('=', left, value, ctx);
};

const splitConditions = (value: unknown): readonly unknown[] =>
  Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? ownKeys(value).map((key) => ({ [key]: value[key] }))
      : [value];

const topLevelOperator = (op: symbol, value: unknown, ctx: WhereContext): ExprNode => {
  const items = (): readonly ExprNode[] =>
    splitConditions(value).map((item) => whereToAst(item, ctx));
  switch (op) {
    case Op.and:
      return and(items());
    case Op.or:
      return or(items());
    case Op.not:
      return { kind: 'prefix', op: 'NOT', expr: whereToAst(value, ctx) };
    default:
      throw new Error(`Invalid top-level where operator: ${String(op)}`);
  }
};

/** Compiles a Sequelize v6 `where` value (object, array or expression) into an AST condition. */
export const whereToAst = (where: unknown, ctx: WhereContext): ExprNode => {
  if (isExpression(where)) {
    return toExpr(where, ctx);
  }
  if (Array.isArray(where)) {
    return and(where.map((item: unknown) => whereToAst(item, ctx)));
  }
  if (!isPlainObject(where)) {
    throw new Error(`Invalid where value: ${String(where)}`);
  }
  return and(
    ownKeys(where).map((key) =>
      isOpKey(key)
        ? topLevelOperator(key, where[key], ctx)
        : attributeCondition(attributeOperand(key, ctx), where[key], ctx),
    ),
  );
};

/** True when a where value has no conditions. */
export const isEmptyWhere = (where: unknown): boolean =>
  where === undefined ||
  where === null ||
  (isPlainObject(where) && ownKeys(where).length === 0) ||
  (Array.isArray(where) && where.length === 0);
