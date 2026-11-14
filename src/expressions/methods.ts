/** @internal */
export const methodKind: unique symbol = Symbol.for('postgrelize.method');

type Method<K extends string, T> = Readonly<{ [methodKind]: K } & T>;

/** Raw SQL fragment inserted into a query as-is. Created by {@link literal}. */
export type Literal = Method<'literal', { val: string }>;
/** SQL function call. Created by {@link fn}. */
export type Fn = Method<'fn', { fn: string; args: readonly unknown[] }>;
/** Column reference. Created by {@link col}. */
export type Col = Method<'col', { col: string | readonly string[] }>;
/** Type cast `CAST(value AS type)`. Created by {@link cast}. */
export type Cast = Method<'cast', { val: unknown; type: string; json: boolean }>;
/** JSON path access or JSON conditions. Created by {@link json}. */
export type Json = Method<'json', { path?: string; conditions?: object; value?: unknown }>;
/** Comparison of an arbitrary expression with a value. Created by {@link where}. */
export type Where = Method<
  'where',
  { attribute: unknown; comparator: string | symbol; logic: unknown }
>;
/** Reference to a column of the row proposed for insertion in `ON CONFLICT DO UPDATE`. Created by {@link excluded}. */
export type Excluded = Method<'excluded', { column: string }>;

/** Any SQL expression builder accepted where Sequelize v6 accepts a `SequelizeMethod`. */
export type SqlExpression = Literal | Fn | Col | Cast | Json | Where | Excluded;

const make = <K extends string, T extends object>(kind: K, fields: T): Method<K, T> =>
  Object.freeze({ [methodKind]: kind, ...fields }) as Method<K, T>;

/** @internal */
export const isExpression = (value: unknown): value is SqlExpression =>
  typeof value === 'object' && value !== null && methodKind in value;

/**
 * Creates a raw SQL fragment. The text is not escaped — never pass user input.
 *
 * @param val - SQL text.
 * @returns Literal expression.
 * @example
 * ```ts
 * await Post.findAll({ order: [literal('"createdAt" DESC NULLS LAST')] });
 * ```
 */
export const literal = (val: string): Literal => make('literal', { val });

/**
 * Creates an SQL function call. Arguments are bound as parameters unless they are expressions.
 *
 * @param name - Function name, e.g. `'lower'`.
 * @param args - Function arguments.
 * @returns Function call expression.
 * @example
 * ```ts
 * await User.findAll({ where: where(fn('lower', col('email')), 'a@b.c') });
 * ```
 */
export const fn = (name: string, ...args: readonly unknown[]): Fn => make('fn', { fn: name, args });

/**
 * Creates a column reference. Dots separate table and column: `'user.id'`.
 *
 * @param name - Column name, optionally prefixed with a table alias.
 * @returns Column expression.
 */
export const col = (name: string): Col => make('col', { col: name });

/**
 * Creates a type cast `CAST(value AS type)`.
 *
 * @param val - Value or expression to cast.
 * @param type - PostgreSQL type name, e.g. `'integer'`.
 * @returns Cast expression.
 */
export const cast = (val: unknown, type: string): Cast =>
  make('cast', { val, type: type.trim(), json: false });

/**
 * Accesses a JSON(B) value by path (`json('meta.a.b')`) or builds JSON conditions
 * (`json({ meta: { a: 1 } })`).
 *
 * @param conditionsOrPath - Dot-separated path, starting with the attribute name, or a conditions object.
 * @param value - Value to compare with when a path is given.
 * @returns JSON expression.
 */
export const json = (conditionsOrPath: string | object, value?: unknown): Json =>
  typeof conditionsOrPath === 'string'
    ? make(
        'json',
        value === undefined ? { path: conditionsOrPath } : { path: conditionsOrPath, value },
      )
    : make('json', { conditions: conditionsOrPath });

/** Call signatures of {@link where}. */
export type WhereFactory = {
  /**
   * @param attribute - Left-hand expression.
   * @param logic - Right-hand value or condition object, compared with `=`.
   */
  (attribute: unknown, logic: unknown): Where;
  /**
   * @param attribute - Left-hand expression.
   * @param comparator - `Op.*` symbol or SQL operator string such as `'>='`.
   * @param logic - Right-hand value.
   */
  (attribute: unknown, comparator: string | symbol, logic: unknown): Where;
};

/**
 * Compares an expression with a value: `where(fn('lower', col('name')), 'bob')` or
 * `where(col('age'), Op.gt, 18)`.
 *
 * @returns Where expression.
 */
export const where: WhereFactory = (
  attribute: unknown,
  ...rest: readonly [unknown] | readonly [string | symbol, unknown]
): Where =>
  rest.length === 1
    ? make('where', { attribute, comparator: '=', logic: rest[0] })
    : make('where', { attribute, comparator: rest[0], logic: rest[1] });

/**
 * References the value proposed for insertion (`EXCLUDED."column"`) inside an `onConflict`
 * update. PostgreSQL extension.
 *
 * @param attribute - Model attribute name.
 * @returns Excluded column expression.
 * @example
 * ```ts
 * await Counter.bulkCreate(rows, {
 *   onConflict: { target: ['key'], action: { update: { hits: excluded('hits') } } },
 * });
 * ```
 */
export const excluded = (attribute: string): Excluded => make('excluded', { column: attribute });
