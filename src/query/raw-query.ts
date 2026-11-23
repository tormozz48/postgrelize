import { SqlLiteral } from '../ddl/sql-literal.ts';
import { SqlExpression } from '../expressions/methods.ts';
import { SqlCompiler, type Chunks, type CompiledQuery } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';

/** Values substituted into raw SQL: `?` for arrays, `:name` for objects. */
export type Replacements = readonly unknown[] | Readonly<Record<string, unknown>>;

/** Bind parameters for raw SQL: `$1` for arrays, `$name` for objects. */
export type BindParameters = readonly unknown[] | Readonly<Record<string, unknown>>;

const TOKEN =
  /'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$|::|:([A-Za-z_]\w*)|\?(?![|&])|\$([A-Za-z_]\w*|\d+)/g;

// A statement given as an object: `{ query, values }` or `{ query, bind }`, also a class instance with these properties.
type TaggedStatement = Readonly<{
  val?: string;
  query?: string;
  values?: Replacements;
  bind?: BindParameters;
}>;

const noContext = new WhereCompiler({ resolve: () => undefined });

const compiler = new SqlCompiler();

const literals = new SqlLiteral();

type TokenContext = Readonly<{
  replacements: Replacements | undefined;
  bind: BindParameters | undefined;
  bindParams: ReadonlyMap<string, Readonly<{ param: unknown }>>;
  /** Leave `$name` and unknown `$n` tokens alone (text that is already parameterized). */
  lenient: boolean;
  /** Write replacement values into the SQL text as escaped literals instead of binding them (ADR-036). */
}>;

/**
 * Converts raw SQL with Sequelize v6 `replacements` and `bind` into a parameterized query.
 * Replacement values of `sequelize.query` are written into the SQL text as escaped literals like v6, so a
 * text may hold several statements (ADR-036); `bind` values and the replacements of a compiled finder
 * statement ({@link RawQuery.inject}) stay bound parameters. String literals, quoted identifiers, comments, dollar-quoted strings and `::` casts are left untouched.
 *
 * @internal
 */
export class RawQuery {
  /**
   * Reads the SQL and the parameters of a `sequelize.query` call, which may be a string, a literal or a
   * "tagged" object (`{ query, values }` / `{ query, bind }`, also a class instance with these properties).
   *
   * @param sql - SQL text, literal or tagged statement.
   * @param options - Options of the call.
   * @returns The SQL text with the single `replacements` / `bind` that apply.
   * @throws Error when both replacements and bind are given, or `replacements` is neither an array nor a plain object.
   */
  statement(
    sql: string | Readonly<{ val: string }> | Readonly<Record<string, unknown>>,
    options: Readonly<{ replacements?: Replacements; bind?: BindParameters }>,
  ): Readonly<{ text: string; replacements?: Replacements; bind?: BindParameters }> {
    if (typeof sql === 'string') {
      return RawQuery.#checked(sql, options.replacements, options.bind);
    }
    const tagged = sql as TaggedStatement;
    if (tagged.val !== undefined || tagged.query === undefined) {
      return RawQuery.#checked(tagged.val as string, options.replacements, options.bind);
    }
    return RawQuery.#fromTagged(tagged.query, tagged, options);
  }

  static #fromTagged(
    query: string,
    tagged: TaggedStatement,
    options: Readonly<{ replacements?: Replacements; bind?: BindParameters }>,
  ): Readonly<{ text: string; replacements?: Replacements; bind?: BindParameters }> {
    RawQuery.#exclusive(tagged.values, options.replacements, 'sql.values', 'options.replacements');
    RawQuery.#exclusive(tagged.bind, options.bind, 'sql.bind', 'options.bind');
    return RawQuery.#checked(
      query,
      tagged.values ?? options.replacements,
      tagged.bind ?? options.bind,
    );
  }

  static #exclusive(first: unknown, second: unknown, a: string, b: string): void {
    if (first !== undefined && second !== undefined) {
      throw new Error(`Both \`${a}\` and \`${b}\` cannot be set at the same time`);
    }
  }

  static #checked(
    text: string,
    replacements: Replacements | undefined,
    bind: BindParameters | undefined,
  ): Readonly<{ text: string; replacements?: Replacements; bind?: BindParameters }> {
    if (replacements !== undefined && bind !== undefined) {
      throw new Error('Both `replacements` and `bind` cannot be set at the same time');
    }
    RawQuery.#assertReplacements(replacements);
    return {
      text: text.trim(),
      ...(replacements === undefined ? {} : { replacements }),
      ...(bind === undefined ? {} : { bind }),
    };
  }

  static #assertReplacements(replacements: unknown): void {
    if (
      replacements !== undefined &&
      !Array.isArray(replacements) &&
      !RawQuery.#isPlain(replacements)
    ) {
      throw new Error(
        `"replacements" must be an array or a plain object, but received ${JSON.stringify(replacements)} instead.`,
      );
    }
  }

  static #isPlain(value: unknown): boolean {
    const prototype =
      typeof value === 'object' && value !== null ? Object.getPrototypeOf(value) : undefined;
    return prototype === Object.prototype || prototype === null;
  }

  /**
   * Prepares raw SQL for execution.
   *
   * @param sql - SQL text with `?` / `:name` replacements and `$1` / `$name` bind parameters.
   * @param options - Replacements and bind parameters.
   * @returns Query text with replacements written as literals, `$n` placeholders for bind parameters and their values.
   * @throws Error for a missing replacement or bind parameter, or a replacement string with a NUL character.
   */
  prepare(
    sql: string,
    options: Readonly<{ replacements?: Replacements; bind?: BindParameters }> = {},
  ): CompiledQuery {
    if (options.replacements === undefined && options.bind === undefined) {
      return { text: sql, values: [] };
    }
    return this.#substitute(sql, options, false);
  }

  /**
   * Substitutes `replacements` into an already compiled statement (a finder's `where: literal(...)`).
   * Values of the statement stay bound and are never scanned; replacement values are written as
   * escaped literals like v6 (ADR-036), so the same placeholder used twice yields identical SQL.
   *
   * @param query - Compiled statement with `$n` placeholders.
   * @param replacements - `?` or `:name` values; the statement is returned unchanged without them.
   * @returns Statement with the replacements inlined.
   * @throws Error for a placeholder without a replacement value.
   */
  inject(query: CompiledQuery, replacements: Replacements | undefined): CompiledQuery {
    return replacements === undefined
      ? query
      : this.#substitute(query.text, { replacements, bind: query.values }, true);
  }

  #substitute(
    sql: string,
    options: Readonly<{ replacements?: Replacements; bind?: BindParameters }>,
    lenient: boolean,
  ): CompiledQuery {
    const ctx: TokenContext = {
      replacements: options.replacements,
      bind: options.bind,
      bindParams: this.#bindChunks(options.bind),
      lenient,
    };
    const matches = [...sql.matchAll(TOKEN)];
    return compiler.finalize([
      ...this.#chunks(sql, matches, ctx),
      RawQuery.#tail(sql, matches.at(-1)),
    ]);
  }

  #chunks(sql: string, matches: readonly RegExpExecArray[], ctx: TokenContext): Chunks {
    return matches.flatMap((match, index): Chunks => {
      const previous = matches[index - 1];
      const previousEnd = previous === undefined ? 0 : previous.index + previous[0].length;
      const questionIndex = matches.slice(0, index).filter((item) => item[0] === '?').length;
      return [sql.slice(previousEnd, match.index), ...this.#tokenChunks(match, questionIndex, ctx)];
    });
  }

  static #tail(sql: string, last: RegExpExecArray | undefined): string {
    return last === undefined ? sql : sql.slice(last.index + last[0].length);
  }

  #valueChunks(value: unknown): Chunks {
    if (value instanceof SqlExpression) {
      const compiled = compiler.compileExpr(noContext.toExpr(value));
      if (compiled.values.length > 0) {
        throw new Error('Expressions with bound values are not supported in replacements');
      }
      return [compiled.text];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item: unknown, index) =>
        index === 0 ? this.#valueChunks(item) : [', ', ...this.#valueChunks(item)],
      );
    }
    return [literals.escape(value)];
  }

  #lookup(source: Replacements | BindParameters, key: string | number, kind: string): unknown {
    const value = Array.isArray(source)
      ? source[Number(key)]
      : (source as Readonly<Record<string, unknown>>)[key];
    if (
      value === undefined &&
      !(Array.isArray(source) ? Number(key) < source.length : key in source)
    ) {
      throw new Error(
        kind === 'replacement' && typeof key === 'string'
          ? `Named replacement ":${key}" has no entry in the replacement map.`
          : `Missing ${kind} value for ${String(key)}`,
      );
    }
    return value;
  }

  #tokenChunks(match: RegExpExecArray, questionIndex: number, ctx: TokenContext): Chunks {
    const [token, , named, bindName] = match;
    if (named !== undefined && ctx.replacements !== undefined && !Array.isArray(ctx.replacements)) {
      return this.#valueChunks(this.#lookup(ctx.replacements, named, 'replacement'));
    }
    if (token === '?' && Array.isArray(ctx.replacements)) {
      return this.#valueChunks(this.#lookup(ctx.replacements, questionIndex, 'replacement'));
    }
    return bindName !== undefined && ctx.bind !== undefined
      ? this.#bindTokenChunks(token, bindName, ctx.bind, ctx)
      : [token];
  }

  #bindTokenChunks(
    token: string,
    bindName: string,
    bind: BindParameters,
    ctx: TokenContext,
  ): Chunks {
    const chunk = ctx.bindParams.get(bindName);
    if (chunk !== undefined) {
      return [chunk];
    }
    if (ctx.lenient) {
      return [token];
    }
    throw new Error(`Named bind parameter "$${bindName}" has no value in the given object.`);
  }

  #bindChunks(bind: BindParameters | undefined): ReadonlyMap<string, Readonly<{ param: unknown }>> {
    return new Map(
      bind === undefined
        ? []
        : Object.entries(bind).map(
            ([key, value]) =>
              [Array.isArray(bind) ? String(Number(key) + 1) : key, { param: value }] as const,
          ),
    );
  }
}
