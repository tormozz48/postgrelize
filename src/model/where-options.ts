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

type Comparable<V> = V | SqlValue;

/** Operators applicable to an attribute of type `V`. */
export type WhereOperators<V = unknown> = {
  /** `= value`; `IS NULL` when the value is `null`. */
  [Op.eq]?: Comparable<V> | null;
  /** `<> value`; `IS NOT NULL` when the value is `null`. */
  [Op.ne]?: Comparable<V> | null;
  /** `IS value`, for `null`, `true` or `false`. */
  [Op.is]?: boolean | null;
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
  [Op.in]?: readonly V[] | Literal | Subquery;
  /** `NOT IN (...)`; long lists compile to `<> ALL($n)`. */
  [Op.notIn]?: readonly V[] | Literal | Subquery;
  /** `BETWEEN a AND b`, value is `[a, b]`. */
  [Op.between]?: readonly [Comparable<V>, Comparable<V>];
  /** `NOT BETWEEN a AND b`, value is `[a, b]`. */
  [Op.notBetween]?: readonly [Comparable<V>, Comparable<V>];
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
  [Op.any]?: readonly V[] | Literal;
  /** `ALL (ARRAY[...])`, combined with a comparison operator. */
  [Op.all]?: readonly V[] | Literal;
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
};

/** `{ [Op.any]: values }` / `{ [Op.all]: values }` used with comparison operators. */
export type AnyAll<V> =
  | {
      /** `ANY (...)`. */
      [Op.any]: readonly V[] | ValuesList<V>;
    }
  | {
      /** `ALL (...)`. */
      [Op.all]: readonly V[] | ValuesList<V>;
    };

/** `{ [Op.values]: [...] }` — `VALUES (...)` list for `Op.any` / `Op.all`. */
export type ValuesList<V> = {
  /** Values. */
  [Op.values]: readonly V[];
};

/** Condition for one attribute: a value, a list of values (`IN`), operators, or an expression. */
export type WhereAttributeValue<V> =
  | Comparable<V>
  | null
  | readonly V[]
  | WhereOperators<V>
  | (V extends object ? Readonly<Record<string, unknown>> : never);

/** Logical combinators allowed at any level of a where object. */
export type WhereLogic<T> = {
  /** Logical AND of nested conditions. */
  [Op.and]?: AllowArray<WhereOptions<T>>;
  /** Logical OR of nested conditions. */
  [Op.or]?: AllowArray<WhereOptions<T>>;
  /** `IS NOT value` for `null`/booleans, otherwise negates a nested condition. */
  [Op.not]?: WhereOptions<T>;
};

/** Where object keyed by attribute names, nested JSON paths (`'meta.a'`), casts (`'id::text'`) or included columns (`'$posts.title$'`). */
export type WhereAttributeHash<T> = { [K in keyof T]?: WhereAttributeValue<T[K]> } & {
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
  | WhereAttributeHash<T>
  | readonly WhereOptions<T>[]
  | Where
  | Literal
  | Fn
  | Json
  | Exists;
