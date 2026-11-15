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
  /** See `Op.eq`. */
  [Op.eq]?: Comparable<V> | null;
  /** See `Op.ne`. */
  [Op.ne]?: Comparable<V> | null;
  /** See `Op.is`. */
  [Op.is]?: boolean | null;
  /** See `Op.not`. */
  [Op.not]?: Comparable<V> | boolean | null | WhereOperators<V>;
  /** See `Op.gt`. */
  [Op.gt]?: Comparable<V> | AnyAll<V>;
  /** See `Op.gte`. */
  [Op.gte]?: Comparable<V> | AnyAll<V>;
  /** See `Op.lt`. */
  [Op.lt]?: Comparable<V> | AnyAll<V>;
  /** See `Op.lte`. */
  [Op.lte]?: Comparable<V> | AnyAll<V>;
  /** See `Op.in`. */
  [Op.in]?: readonly V[] | Literal | Subquery;
  /** See `Op.notIn`. */
  [Op.notIn]?: readonly V[] | Literal | Subquery;
  /** See `Op.between`. */
  [Op.between]?: readonly [Comparable<V>, Comparable<V>];
  /** See `Op.notBetween`. */
  [Op.notBetween]?: readonly [Comparable<V>, Comparable<V>];
  /** See `Op.like`. */
  [Op.like]?: string | SqlValue | AnyAll<string>;
  /** See `Op.notLike`. */
  [Op.notLike]?: string | SqlValue | AnyAll<string>;
  /** See `Op.iLike`. */
  [Op.iLike]?: string | SqlValue | AnyAll<string>;
  /** See `Op.notILike`. */
  [Op.notILike]?: string | SqlValue | AnyAll<string>;
  /** See `Op.startsWith`. */
  [Op.startsWith]?: string | SqlValue;
  /** See `Op.endsWith`. */
  [Op.endsWith]?: string | SqlValue;
  /** See `Op.substring`. */
  [Op.substring]?: string | SqlValue;
  /** See `Op.regexp`. */
  [Op.regexp]?: string | SqlValue;
  /** See `Op.notRegexp`. */
  [Op.notRegexp]?: string | SqlValue;
  /** See `Op.iRegexp`. */
  [Op.iRegexp]?: string | SqlValue;
  /** See `Op.notIRegexp`. */
  [Op.notIRegexp]?: string | SqlValue;
  /** See `Op.overlap`. */
  [Op.overlap]?: unknown;
  /** See `Op.contains`. */
  [Op.contains]?: unknown;
  /** See `Op.contained`. */
  [Op.contained]?: unknown;
  /** See `Op.adjacent`. */
  [Op.adjacent]?: unknown;
  /** See `Op.strictLeft`. */
  [Op.strictLeft]?: unknown;
  /** See `Op.strictRight`. */
  [Op.strictRight]?: unknown;
  /** See `Op.noExtendLeft`. */
  [Op.noExtendLeft]?: unknown;
  /** See `Op.noExtendRight`. */
  [Op.noExtendRight]?: unknown;
  /** See `Op.match`. */
  [Op.match]?: SqlValue;
  /** See `Op.col`. */
  [Op.col]?: string;
  /** See `Op.and`. */
  [Op.and]?: AllowArray<Comparable<V> | WhereOperators<V>>;
  /** See `Op.or`. */
  [Op.or]?: AllowArray<Comparable<V> | WhereOperators<V>>;
  /** See `Op.any`. */
  [Op.any]?: readonly V[] | Literal;
  /** See `Op.all`. */
  [Op.all]?: readonly V[] | Literal;
  /** See `Op.isDistinctFrom`. */
  [Op.isDistinctFrom]?: Comparable<V> | null;
  /** See `Op.isNotDistinctFrom`. */
  [Op.isNotDistinctFrom]?: Comparable<V> | null;
  /** See `Op.hasKey`. */
  [Op.hasKey]?: string;
  /** See `Op.hasAnyKeys`. */
  [Op.hasAnyKeys]?: readonly string[];
  /** See `Op.hasAllKeys`. */
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
  /** See `Op.and`. */
  [Op.and]?: AllowArray<WhereOptions<T>>;
  /** See `Op.or`. */
  [Op.or]?: AllowArray<WhereOptions<T>>;
  /** See `Op.not`. */
  [Op.not]?: WhereOptions<T>;
};

/** Where object keyed by attribute names, nested JSON paths (`'meta.a'`), casts (`'id::text'`) or included columns (`'$posts.title$'`). */
export type WhereAttributeHash<T> = { [K in keyof T]?: WhereAttributeValue<T[K]> } & {
  [key: `$${string}$` | `${string}.${string}` | `${string}::${string}`]: unknown;
} & WhereLogic<T>;

/** `where` option of queries (Sequelize v6 `WhereOptions`). */
export type WhereOptions<T = Record<string, unknown>> =
  | WhereAttributeHash<T>
  | readonly WhereOptions<T>[]
  | Where
  | Literal
  | Fn
  | Json
  | Exists;
