import type {
  Cast,
  Col,
  Excluded,
  Exists,
  Fn,
  Json,
  Literal,
  Subquery,
  Tuple,
  Where,
} from '../expressions/methods.ts';
import type { Op } from '../expressions/op.ts';
import type { AllowArray } from './types.ts';

/** Expressions accepted in place of a value (`Excluded` only inside `onConflict`). */
export type SqlValue = Literal | Fn | Col | Cast | Excluded | Subquery | Tuple;

// Like v6 `StaticValues`: a plain string, number, boolean, bigint, Date or Buffer compares with any column.
type Serializable = string | number | bigint | boolean | Date | Buffer;

type Comparable<V> = V | Serializable | SqlValue;

/** Operators applicable to an attribute of type `V`. */
export type WhereOperators<V = unknown> = {
  /** `= value`; `IS NULL` when the value is `null`. */
  [Op.eq]?: Comparable<V> | null;
  /** `<> value`; `IS NOT NULL` when the value is `null`. */
  [Op.ne]?: Comparable<V> | null;
  /** `IS value`: `null`, `true`, `false` or a `literal(...)` written as is, like v6. */
  [Op.is]?: boolean | null | Literal;
  /** `IS NOT value` for `null`/booleans, otherwise negates a nested condition. */
  [Op.not]?: Comparable<V> | boolean | null | WhereOperators<V>;
  /** `> value`. */
  [Op.gt]?: Comparable<V> | AnyAll<V>;
  /** `>= value`. */
  [Op.gte]?: Comparable<V> | AnyAll<V>;
  /** `< value`. */
  [Op.lt]?: Comparable<V> | AnyAll<V>;
  /** `<= value`. */
  [Op.lte]?: Comparable<V> | AnyAll<V>;
  /** `IN (...)`; long lists compile to `= ANY($n)`. */
  [Op.in]?: readonly Comparable<V>[] | Literal | Subquery;
  /** `NOT IN (...)`; long lists compile to `<> ALL($n)`. */
  [Op.notIn]?: readonly Comparable<V>[] | Literal | Subquery;
  /** `BETWEEN a AND b`, value is `[a, b]`. */
  [Op.between]?: readonly Comparable<V>[];
  /** `NOT BETWEEN a AND b`, value is `[a, b]`. */
  [Op.notBetween]?: readonly Comparable<V>[];
  /** `LIKE pattern`. */
  [Op.like]?: string | SqlValue | AnyAll<string>;
  /** `NOT LIKE pattern`. */
  [Op.notLike]?: string | SqlValue | AnyAll<string>;
  /** `ILIKE pattern`. */
  [Op.iLike]?: string | SqlValue | AnyAll<string>;
  /** `NOT ILIKE pattern`. */
  [Op.notILike]?: string | SqlValue | AnyAll<string>;
  /** `LIKE 'value%'`. */
  [Op.startsWith]?: string | SqlValue;
  /** `LIKE '%value'`. */
  [Op.endsWith]?: string | SqlValue;
  /** `LIKE '%value%'`. */
  [Op.substring]?: string | SqlValue;
  /** `~ pattern` (POSIX regular expression). */
  [Op.regexp]?: string | SqlValue;
  /** `!~ pattern`. */
  [Op.notRegexp]?: string | SqlValue;
  /** `~* pattern` (case-insensitive regular expression). */
  [Op.iRegexp]?: string | SqlValue;
  /** `!~* pattern`. */
  [Op.notIRegexp]?: string | SqlValue;
  /** `&&` — arrays or ranges overlap. */
  [Op.overlap]?: unknown;
  /** `@>` — array, range or jsonb contains the value. */
  [Op.contains]?: unknown;
  /** `<@` — array, range or jsonb is contained by the value. */
  [Op.contained]?: unknown;
  /** `-|-` — ranges are adjacent. */
  [Op.adjacent]?: unknown;
  /** `<<` — range is strictly left of the value. */
  [Op.strictLeft]?: unknown;
  /** `>>` — range is strictly right of the value. */
  [Op.strictRight]?: unknown;
  /** `&>` — range does not extend to the left of the value. */
  [Op.noExtendLeft]?: unknown;
  /** `&<` — range does not extend to the right of the value. */
  [Op.noExtendRight]?: unknown;
  /** `@@` — tsvector matches tsquery. */
  [Op.match]?: SqlValue;
  /** Compares with another column, value is a column reference such as `'user.id'`. */
  [Op.col]?: string;
  /** Logical AND of nested conditions. */
  [Op.and]?: AllowArray<Comparable<V> | WhereOperators<V>>;
  /** Logical OR of nested conditions. */
  [Op.or]?: AllowArray<Comparable<V> | WhereOperators<V>>;
  /** `ANY (ARRAY[...])`, combined with a comparison operator. */
  [Op.any]?: readonly Comparable<V>[] | Literal;
  /** `ALL (ARRAY[...])`, combined with a comparison operator. */
  [Op.all]?: readonly Comparable<V>[] | Literal;
  /** `IS DISTINCT FROM value` (null-safe `<>`). PostgreSQL extension. */
  [Op.isDistinctFrom]?: Comparable<V> | null;
  /** `IS NOT DISTINCT FROM value` (null-safe `=`). PostgreSQL extension. */
  [Op.isNotDistinctFrom]?: Comparable<V> | null;
  /** jsonb `?` — top-level key exists. PostgreSQL extension. */
  [Op.hasKey]?: string;
  /** jsonb `?|` — any of the keys exist. PostgreSQL extension. */
  [Op.hasAnyKeys]?: readonly string[];
  /** jsonb `?&` — all of the keys exist. PostgreSQL extension. */
  [Op.hasAllKeys]?: readonly string[];
  /** `SIMILAR TO pattern` (SQL regular expression). PostgreSQL extension. */
  [Op.similarTo]?: string | SqlValue;
  /** `NOT SIMILAR TO pattern`. PostgreSQL extension. */
  [Op.notSimilarTo]?: string | SqlValue;
  /** jsonb `@?` — the jsonpath returns any item; the value is a jsonpath string. PostgreSQL extension. */
  [Op.jsonPathExists]?: string | SqlValue;
  /** `<<=` — inet/cidr subnet is contained within or equals the value. PostgreSQL extension. */
  [Op.containedOrEqual]?: unknown;
  /** `>>=` — inet/cidr subnet contains or equals the value. PostgreSQL extension. */
  [Op.containsOrEqual]?: unknown;
  /** `%` — `pg_trgm` trigram similarity above `pg_trgm.similarity_threshold`. PostgreSQL extension. */
  [Op.trigramSimilar]?: string | SqlValue;
  /** `<%` — `pg_trgm`: the column is similar to a part of the value. PostgreSQL extension. */
  [Op.trigramWordSimilar]?: string | SqlValue;
  /** `<<%` — `pg_trgm`: the column is strictly similar to a word of the value. PostgreSQL extension. */
  [Op.trigramStrictWordSimilar]?: string | SqlValue;
  /** `%>` — `pg_trgm`: the column has a part similar to the value. PostgreSQL extension. */
  [Op.trigramHasSimilarWord]?: string | SqlValue;
  /** `%>>` — `pg_trgm`: the column has a strictly similar word of the value. PostgreSQL extension. */
  [Op.trigramHasSimilarStrictWord]?: string | SqlValue;
};

/** `{ [Op.any]: values }` / `{ [Op.all]: values }` used with comparison operators. */
export type AnyAll<V> =
  | {
      /** `ANY (...)`. */
      [Op.any]: readonly Comparable<V>[] | ValuesList<V>;
    }
  | {
      /** `ALL (...)`. */
      [Op.all]: readonly Comparable<V>[] | ValuesList<V>;
    };

/** `{ [Op.values]: [...] }` — `VALUES (...)` list for `Op.any` / `Op.all`. */
export type ValuesList<V> = {
  /** Values. */
  [Op.values]: readonly Comparable<V>[];
};

/** Condition for one attribute: a value, a list of values (`IN`), operators, or an expression. */
export type WhereAttributeValue<V> =
  | Comparable<V>
  // v6 values come from `WhereOperators[Op.eq]`, an optional property, so they include `undefined`
  // (also under `exactOptionalPropertyTypes`); a runtime `undefined` still throws like in v6
  | undefined
  | null
  | readonly Comparable<V>[]
  | WhereOperators<V>
  | (V extends object ? Readonly<Record<string, unknown>> : never);

/** Logical combinators allowed at any level of a where object. */
export type WhereLogic<T> = {
  /** Logical AND of nested conditions. */
  [Op.and]?: AllowArray<WhereOptions<NoInfer<T>>>;
  /** Logical OR of nested conditions. */
  [Op.or]?: AllowArray<WhereOptions<NoInfer<T>>>;
  /** `IS NOT value` for `null`/booleans, otherwise negates a nested condition. */
  [Op.not]?: WhereOptions<NoInfer<T>>;
};

// Each member requires its operator (as v6 `AndOperator` / `OrOperator` / `NotOperator`): an all-optional member would also
// accept `{}`, so assigning `{}` to a `WhereOptions` variable would keep it in the narrowed type and hide the attribute keys.
type RequiredLogic<T> =
  | { [Op.and]: NonNullable<WhereLogic<T>[typeof Op.and]> }
  | { [Op.or]: NonNullable<WhereLogic<T>[typeof Op.or]> }
  | { [Op.not]: NonNullable<WhereLogic<T>[typeof Op.not]> };

/**
 * Condition for one attribute in a where object (Sequelize v6 `WhereAttributeHashValue`); the same type as {@link WhereAttributeValue}.
 *
 * @example
 * ```ts
 * const name: WhereAttributeHashValue<string> = { [Op.iLike]: 'a%' };
 * const ids: WhereAttributeHashValue<number> = [1, 2, 3];
 * ```
 */
export type WhereAttributeHashValue<V> = WhereAttributeValue<V>;

// Indexed through a tuple so a union model is not distributed: a mapped type over a bare type parameter is, one over `W[0]` is not.
type WhereAttributeShape<W extends readonly [unknown]> = {
  [K in keyof W[0]]?: WhereAttributeValue<W[0][K]>;
};

/**
 * Where object keyed by attribute names, nested JSON paths (`'meta.a'`), casts (`'id::text'`) or included columns (`'$posts.title$'`).
 * Without a type argument every key is accepted, as in Sequelize v6.
 *
 * @example
 * ```ts
 * const any: WhereAttributeHash = { id: 1, 'meta.key': 'a' };
 * const typed: WhereAttributeHash<{ id: number }> = { id: 1 };
 * ```
 */
// oxlint-disable-next-line typescript/no-explicit-any -- v6 declares the default this way.
export type WhereAttributeHash<T = any> = WhereAttributeShape<[T]> & {
  [key: `$${string}$` | `${string}.${string}` | `${string}::${string}`]: unknown;
} & WhereLogic<T>;

/**
 * `where` option of queries (Sequelize v6 `WhereOptions`).
 *
 * A condition is an object keyed by attribute (equality, `IN` for arrays, or operators), a list of conditions (`OR`), or an expression (`where()`, `literal()`, `fn()`, ...). Values are always bound parameters.
 *
 * @see {@link Op}
 *
 * @example
 * ```ts
 * const w: WhereOptions<User> = {
 *   active: true,
 *   age: { [Op.between]: [18, 65] },
 *   role: ['admin', 'editor'],
 *   [Op.or]: [{ name: { [Op.iLike]: 'a%' } }, { email: { [Op.endsWith]: '@example.com' } }],
 *   '$posts.title$': 'Hello',
 * };
 * const rows = await User.findAll({ where: w, include: [Post] });
 * ```
 */
export type WhereOptions<T = Record<string, unknown>> =
  // `NoInfer`: like in v6, `T` is never inferred from the conditions, so a generic helper
  // `scope<T>(where: WhereOptions<T>)` takes `T` from the `where` it feeds
  | WhereAttributeHash<NoInfer<T>>
  | RequiredLogic<T>
  | readonly WhereOptions<T>[]
  | Where
  | Literal
  | Fn
  | Json
  | Exists;
