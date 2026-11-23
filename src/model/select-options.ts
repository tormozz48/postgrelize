import type { LateralKeys } from './lateral-keys-builder.ts';
import type { TableSampleOptions } from './source-options.ts';
import type { Col, Fn, Literal } from '../expressions/methods.ts';
import type { FromItem, LockNode, QueryNode, WithClause } from '../sql/ast.ts';

/**
 * Aliased attribute `[expression, alias]` in `attributes` (Sequelize v6 `ProjectionAlias`).
 *
 * @example
 * ```ts
 * const total: ProjectionAlias = [fn('count', col('id')), 'total'];
 * const rows = await Post.findAll({ attributes: ['authorId', total], group: ['authorId'] });
 * ```
 */
export type ProjectionAlias = readonly [string | Literal | Fn | Col, string];

/**
 * Selected attributes: a list of names or `[expression, alias]` pairs, or an `{ include, exclude }` spec.
 *
 * @example
 * ```ts
 * const list: FindAttributeOptions = ['id', 'name', [fn('count', col('id')), 'total']];
 * const spec: FindAttributeOptions = { include: [[literal('1'), 'one']], exclude: ['password'] };
 * ```
 */
export type FindAttributeOptions = readonly (string | readonly [unknown, string])[] | AttributeSpec;

/** The `attributes: { include, exclude }` form: all attributes plus/minus some. */
export type AttributeSpec = Readonly<{
  /** Extra columns added to all attributes. */
  include?: readonly (string | readonly [unknown, string])[];
  /** Attributes left out. */
  exclude?: readonly string[];
}>;

/** One `order` item: attribute name, `[attribute, direction]`, `[expression, direction]` or an expression. */
export type OrderItem = string | unknown | readonly [unknown, string?];

/** `order` option of finders: a single expression or a list of {@link OrderItem}. */
export type Order = Fn | Col | Literal | OrderItem[];

/** Model whose rows are locked by `lock.of`. */
export type LockTarget = Readonly<{
  /** Model name, which is the table alias in the query. */
  name: string;
}>;

/** `lock` option of finders: `true` (`FOR UPDATE`), a lock strength, or `{ level, of }`. */
export type LockOption =
  | boolean
  | LockNode['strength']
  | Readonly<{
      /** Lock strength. */
      level: LockNode['strength'];
      /** Model whose rows are locked (`FOR UPDATE OF`). */
      of?: LockTarget;
    }>;

/**
 * Options that shape a SELECT statement, shared by finders and `copyTo`.
 *
 * Finders extend this with flags such as `raw` and `include` ({@link FindOptions}).
 *
 * @example
 * ```ts
 * const opts: SelectOptions = {
 *   attributes: ['status', [fn('count', col('id')), 'n']],
 *   group: ['status'],
 *   having: { n: { [Op.gt]: 1 } },
 *   order: [['status', 'DESC']],
 *   limit: 20,
 *   offset: 40,
 * };
 * ```
 */
export type SelectOptions = Readonly<{
  /** Filter; finders type this as {@link WhereOptions}. */
  where?: unknown;
  /** Selected attributes. All attributes when omitted. */
  attributes?: FindAttributeOptions;
  /** Sort order: attribute names, `[attribute, 'ASC' | 'DESC']` pairs or expressions. */
  order?: Order | readonly OrderItem[];
  /** `GROUP BY` attributes or expressions. */
  group?: unknown;
  /** `HAVING` condition. */
  having?: unknown;
  /** Maximum number of rows; `null` or `undefined` for no limit. */
  limit?: number | null;
  /** Number of rows to skip; `null` or `undefined` to skip none. */
  offset?: number | null;
  /** Row lock (`FOR UPDATE` etc.); requires a transaction. */
  lock?: LockOption;
  /** Add `SKIP LOCKED` to the row lock; only with `lock`. */
  skipLocked?: boolean;
  /**
   * Add `NOWAIT` to the row lock so the query fails instead of waiting; only with `lock`. PostgreSQL extension.
   * @postgrelize
   */
  noWait?: boolean;
  /**
   * `SELECT DISTINCT ON (...)`: attributes or expressions. PostgreSQL extension.
   * @postgrelize
   */
  distinctOn?: readonly unknown[];
  /**
   * `FETCH FIRST limit ROWS WITH TIES` instead of `LIMIT`: also returns the rows that tie with the
   * last one on the `order` columns. Needs `limit` and `order`. PostgreSQL extension.
   * @postgrelize
   */
  withTies?: boolean;
  /**
   * Read only a random sample of the model table (`TABLESAMPLE`). PostgreSQL extension.
   * @postgrelize
   */
  sample?: TableSampleOptions;
  /** @internal Top-N-per-parent read of a lateral include. */
  lateralKeys?: LateralKeys;
  /** @internal Resolved `source` subquery: rows come from it instead of the model table. */
  fromQuery?: QueryNode;
  /** @internal Resolved `WITH` clause. */
  withClause?: WithClause;
  /** @internal Resolved extra FROM relations. */
  extraFrom?: readonly FromItem[];
}>;
