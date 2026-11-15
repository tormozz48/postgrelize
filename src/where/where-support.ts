import { SqlExpression } from '../expressions/methods.ts';
import { SqlAst, type ExprNode } from '../sql/ast.ts';

/** Attribute facts the where compiler needs; supplied by the model layer. */
export type AttributeRef = Readonly<{
  field: string;
  isJson?: boolean;
  serialize?: (value: unknown) => unknown;
}>;

/** Attribute resolver and options injected into a `WhereCompiler`. */
export type WhereContext = Readonly<{
  tableAlias?: string;
  resolve: (attribute: string) => AttributeRef | undefined;
  inAsAnyThreshold?: number;
  /** Allows `excluded()` (only inside `ON CONFLICT DO UPDATE`). */
  allowExcluded?: boolean;
}>;

/** JSON(B) column and the key path read from it. */
export type JsonAccess = Readonly<{ base: ExprNode; path: readonly string[] }>;

/** Left-hand side of a condition: the AST node plus the attribute or JSON path it came from. */
export type Operand = Readonly<{ node: ExprNode; ref?: AttributeRef; json?: JsonAccess }>;

/** Plain conditions object of a `where` value. */
export type Conditions = Readonly<Record<string | symbol, unknown>>;

/** Where context plus value conversion (implemented by `WhereCompiler`). */
export type ExprConverter = Readonly<{
  context: WhereContext;
  toExpr(value: unknown, ref?: AttributeRef): ExprNode;
}>;

const ast = new SqlAst();

/** True for a plain conditions object (not an array, date, buffer or expression). */
export const isPlainObject = (value: unknown): value is Conditions =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value) &&
  !(value instanceof SqlExpression);

/** String and symbol keys of an object. */
export const ownKeys = (value: object): readonly (string | symbol)[] => Reflect.ownKeys(value);

/** True for an `Op.*` key. */
export const isOpKey = (key: string | symbol): key is symbol => typeof key === 'symbol';

/** True when a conditions object has at least one `Op.*` key. */
export const hasOpKeys = (value: Conditions): boolean => ownKeys(value).some(isOpKey);

/** Dot-separated column path (or `*`) as an AST node. */
export const columnPath = (path: string): ExprNode =>
  path === '*' ? { kind: 'star' } : ast.ident(...path.split('.'));

/** Applies the attribute serializer, when there is one. */
export const serializeWith = (ref: AttributeRef | undefined, value: unknown): unknown =>
  ref?.serialize === undefined ? value : ref.serialize(value);

// The path is bound as a text[] parameter, so keys with `,`, `"` or a backslash need no escaping.
/** Text value at the path of a JSON column (`#>>`). */
export const jsonOperand = (json: JsonAccess): Operand => ({
  node: ast.binary('#>>', json.base, ast.param(json.path)),
  json,
});

/** jsonb value at the path of a JSON operand (`#>`), for jsonb operators. */
export const jsonbAt = (json: JsonAccess): ExprNode =>
  ast.binary('#>', json.base, ast.param(json.path));

/** Wraps an operand in a cast when a type is given. */
export const withCast = (operand: Operand, type: string | undefined): Operand =>
  type === undefined ? operand : { node: { kind: 'cast', expr: operand.node, type } };
