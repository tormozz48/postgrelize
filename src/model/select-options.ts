import type { FromItem, LockNode, WithClause } from '../sql/ast.ts';

/** `attributes` option of finders. */
export type FindAttributeOptions = readonly (string | readonly [unknown, string])[] | AttributeSpec;

/** `attributes: { include, exclude }` form. */
export type AttributeSpec = Readonly<{
  /** Extra columns added to all attributes. */
  include?: readonly (string | readonly [unknown, string])[];
  /** Attributes left out. */
  exclude?: readonly string[];
}>;

/** One `order` item: attribute name, `[attribute, direction]`, `[expression, direction]` or an expression. */
export type OrderItem = string | unknown | readonly [unknown, string?];

/** `order` option of finders. */
export type Order = unknown | readonly OrderItem[];

/** Model whose rows are locked by `lock.of`. */
export type LockTarget = Readonly<{
  /** Model name used as table alias. */
  name: string;
}>;

/** `lock` option of finders. */
export type LockOption =
  | boolean
  | LockNode['strength']
  | Readonly<{
      /** Lock strength. */
      level: LockNode['strength'];
      /** Model whose rows are locked (`FOR UPDATE OF`). */
      of?: LockTarget;
    }>;

/** Options that shape a SELECT statement. */
export type SelectOptions = Readonly<{
  /** Filter. */
  where?: unknown;
  /** Selected attributes. */
  attributes?: FindAttributeOptions;
  /** Sort order. */
  order?: Order;
  /** `GROUP BY` attributes or expressions. */
  group?: unknown;
  /** `HAVING` condition. */
  having?: unknown;
  /** Maximum number of rows. */
  limit?: number | null;
  /** Rows to skip. */
  offset?: number | null;
  /** Row lock (`FOR UPDATE` etc.); requires a transaction. */
  lock?: LockOption;
  /** `SKIP LOCKED`. */
  skipLocked?: boolean;
  /** `NOWAIT`. PostgreSQL extension. */
  noWait?: boolean;
  /** `SELECT DISTINCT ON (...)`: attributes or expressions. PostgreSQL extension. */
  distinctOn?: readonly unknown[];
  /** @internal Resolved `WITH` clause. */
  withClause?: WithClause;
  /** @internal Resolved extra FROM relations. */
  extraFrom?: readonly FromItem[];
}>;
