import { SqlExpression } from '../expressions/methods.ts';
import { SqlCompiler, type Chunks, type CompiledQuery } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';

/** Values substituted into raw SQL: `?` for arrays, `:name` for objects. */
export type Replacements = readonly unknown[] | Readonly<Record<string, unknown>>;

/** Bind parameters for raw SQL: `$1` for arrays, `$name` for objects. */
export type BindParameters = readonly unknown[] | Readonly<Record<string, unknown>>;

const TOKEN =
  /'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$|::|:([A-Za-z_]\w*)|\?(?![|&])|\$([A-Za-z_]\w*|\d+)/g;

const noContext = new WhereCompiler({ resolve: () => undefined });

const compiler = new SqlCompiler();

const valueChunks = (value: unknown): Chunks => {
  if (value instanceof SqlExpression) {
    const compiled = compiler.compileExpr(noContext.toExpr(value));
    if (compiled.values.length > 0) {
      throw new Error('Expressions with bound values are not supported in replacements');
    }
    return [compiled.text];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) =>
      index === 0 ? valueChunks(item) : [', ', ...valueChunks(item)],
    );
  }
  return [{ param: value }];
};

const lookup = (
  source: Replacements | BindParameters,
  key: string | number,
  kind: string,
): unknown => {
  const value = Array.isArray(source)
    ? source[Number(key)]
    : (source as Readonly<Record<string, unknown>>)[key];
  if (
    value === undefined &&
    !(Array.isArray(source) ? Number(key) < source.length : key in source)
  ) {
    throw new Error(`Missing ${kind} value for ${String(key)}`);
  }
  return value;
};

type TokenContext = Readonly<{
  replacements: Replacements | undefined;
  bind: BindParameters | undefined;
  bindParams: ReadonlyMap<string, Readonly<{ param: unknown }>>;
}>;

const tokenChunks = (match: RegExpExecArray, questionIndex: number, ctx: TokenContext): Chunks => {
  const [token, , named, bindName] = match;
  if (named !== undefined && ctx.replacements !== undefined && !Array.isArray(ctx.replacements)) {
    return valueChunks(lookup(ctx.replacements, named, 'replacement'));
  }
  if (token === '?' && Array.isArray(ctx.replacements)) {
    return valueChunks(lookup(ctx.replacements, questionIndex, 'replacement'));
  }
  if (bindName !== undefined && ctx.bind !== undefined) {
    const key = Array.isArray(ctx.bind) ? String(Number(bindName) - 1) : bindName;
    const chunk = ctx.bindParams.get(key);
    if (chunk === undefined) {
      throw new Error(`Missing bind parameter $${bindName}`);
    }
    return [chunk];
  }
  return [token];
};

const bindChunks = (
  bind: BindParameters | undefined,
): ReadonlyMap<string, Readonly<{ param: unknown }>> =>
  new Map(
    bind === undefined
      ? []
      : Object.entries(bind).map(([key, value]) => [key, { param: value }] as const),
  );

/**
 * Converts raw SQL with Sequelize v6 `replacements` and `bind` into a parameterized query.
 * Replacement values are bound as parameters instead of being inlined; string literals,
 * quoted identifiers, comments, dollar-quoted strings and `::` casts are left untouched.
 */
export const prepareRawQuery = (
  sql: string,
  options: Readonly<{ replacements?: Replacements; bind?: BindParameters }> = {},
): CompiledQuery => {
  if (options.replacements === undefined && options.bind === undefined) {
    return { text: sql, values: [] };
  }
  const ctx: TokenContext = {
    replacements: options.replacements,
    bind: options.bind,
    bindParams: bindChunks(options.bind),
  };
  const matches = [...sql.matchAll(TOKEN)];
  const chunks = matches.flatMap((match, index): Chunks => {
    const previous = matches[index - 1];
    const previousEnd = previous === undefined ? 0 : previous.index + previous[0].length;
    const questionIndex = matches.slice(0, index).filter((item) => item[0] === '?').length;
    return [sql.slice(previousEnd, match.index), ...tokenChunks(match, questionIndex, ctx)];
  });
  const last = matches.at(-1);
  const tail = last === undefined ? sql : sql.slice(last.index + last[0].length);
  return compiler.finalize([...chunks, tail]);
};
