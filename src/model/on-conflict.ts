import {
  excluded,
  isExpression,
  type Fn,
  type Literal,
  type SqlExpression,
} from '../expressions/methods.ts';
import { ident, raw, type ConflictTarget, type ExprNode, type OnConflictNode } from '../sql/ast.ts';
import { isEmptyWhere, toExpr, whereToAst } from '../where/where.ts';
import type { ModelDefinition } from './definition.ts';
import { setItems, whereContext } from './query-builders.ts';
import type { WhereOptions } from './types.ts';

/** Columns or index expressions identifying the unique index, optionally a partial index. */
export type OnConflictColumnsTarget<T> = Readonly<{
  /** Attribute names or index expressions (e.g. `fn('lower', col('email'))`, `literal('email COLLATE "C"')`). */
  columns: readonly ((keyof T & string) | Literal | Fn)[];
  /** Predicate of a partial unique index (`ON CONFLICT (...) WHERE ...`). */
  where?: WhereOptions<T>;
}>;

/** Named constraint used as arbiter (`ON CONFLICT ON CONSTRAINT name`). */
export type OnConflictConstraintTarget = Readonly<{
  /** Constraint name. */
  constraint: string;
}>;

/** Conflict target of {@link OnConflictOptions}. */
export type OnConflictTarget<T> =
  | readonly ((keyof T & string) | Literal | Fn)[]
  | OnConflictColumnsTarget<T>
  | OnConflictConstraintTarget;

/**
 * Values assigned on conflict: a list of attributes (each set to `excluded(attribute)`) or a map
 * of attribute to value or expression (`excluded()`, `col()`, `fn()`, `literal()`).
 */
export type OnConflictUpdate<T> =
  | readonly (keyof T & string)[]
  | Readonly<{ [K in keyof T]?: T[K] | SqlExpression }>;

/** `DO UPDATE` action of {@link OnConflictOptions}. */
export type OnConflictUpdateAction<T> = Readonly<{
  /** Assignments. */
  update: OnConflictUpdate<T>;
  /** Only update rows matching this condition (`DO UPDATE ... WHERE`); others are left unchanged. */
  where?: WhereOptions<T>;
}>;

/**
 * Advanced `INSERT ... ON CONFLICT` specification. PostgreSQL extension.
 *
 * @example
 * ```ts
 * await Counter.bulkCreate(rows, {
 *   onConflict: {
 *     target: ['tenantId', 'key'],
 *     action: {
 *       update: { hits: literal('"Counter"."hits" + EXCLUDED."hits"'), updatedAt: fn('now') },
 *       where: { version: { [Op.lt]: excluded('version') } },
 *     },
 *   },
 * });
 * ```
 */
export type OnConflictOptions<T> = Readonly<{
  /** Unique index or constraint to arbitrate on. Required for `update`. */
  target?: OnConflictTarget<T>;
  /** `'nothing'` to skip conflicting rows, or an update. */
  action: 'nothing' | OnConflictUpdateAction<T>;
}>;

const assertAttribute = (definition: ModelDefinition, name: string): string => {
  const attribute = definition.attributes.get(name);
  if (attribute === undefined) {
    throw new Error(`onConflict: unknown attribute "${name}" of model ${definition.name}`);
  }
  return attribute.field;
};

const targetItem = (definition: ModelDefinition, item: unknown): ExprNode =>
  isExpression(item)
    ? toExpr(item, whereContext(definition, undefined))
    : ident(assertAttribute(definition, String(item)));

const isConstraintTarget = (
  target: OnConflictTarget<unknown>,
): target is OnConflictConstraintTarget => !Array.isArray(target) && 'constraint' in target;

const conflictTarget = (
  definition: ModelDefinition,
  target: OnConflictTarget<unknown>,
): ConflictTarget => {
  if (isConstraintTarget(target)) {
    return { kind: 'constraint', name: target.constraint };
  }
  const columnsTarget = (
    Array.isArray(target) ? { columns: target } : target
  ) as OnConflictColumnsTarget<unknown>;
  if (columnsTarget.columns.length === 0) {
    throw new Error('onConflict: target columns must not be empty');
  }
  const where = isEmptyWhere(columnsTarget.where)
    ? undefined
    : whereToAst(columnsTarget.where, whereContext(definition, undefined));
  return {
    kind: 'columns',
    items: columnsTarget.columns.map((item) => targetItem(definition, item)),
    ...(where === undefined ? {} : { where }),
  };
};

const updateValues = (
  definition: ModelDefinition,
  update: OnConflictUpdate<unknown>,
): Readonly<Record<string, unknown>> => {
  const entries: readonly (readonly [string, unknown])[] = Array.isArray(update)
    ? update.map((name: string) => [name, excluded(name)] as const)
    : Object.entries(update);
  if (entries.length === 0) {
    throw new Error('onConflict: update must assign at least one attribute');
  }
  entries.forEach(([name]) => assertAttribute(definition, name));
  const updatedAt = definition.updatedAt;
  return Object.fromEntries(
    updatedAt === undefined || entries.some(([name]) => name === updatedAt)
      ? entries
      : [...entries, [updatedAt, excluded(updatedAt)] as const],
  );
};

/**
 * Validates `onConflict` and converts it into an AST node. The target table must be aliased with
 * the model name so `col()` and `where` refer to the existing row.
 */
export const buildOnConflict = (
  definition: ModelDefinition,
  options: OnConflictOptions<unknown>,
): OnConflictNode => {
  const target =
    options.target === undefined ? undefined : conflictTarget(definition, options.target);
  if (options.action === 'nothing') {
    return { ...(target === undefined ? {} : { target }), action: { kind: 'nothing' } };
  }
  if (target === undefined) {
    throw new Error('onConflict: target is required when action is an update');
  }
  const ctx = { ...whereContext(definition, definition.name), allowExcluded: true };
  const set = setItems(definition, updateValues(definition, options.action.update), ctx);
  const where = isEmptyWhere(options.action.where)
    ? undefined
    : whereToAst(options.action.where, ctx);
  return { target, action: { kind: 'update', set, ...(where === undefined ? {} : { where }) } };
};

/** Column added to `RETURNING` to tell inserted rows from updated ones. */
export const INSERTED_FLAG = '__pgz_inserted';

/** `(xmax = 0) AS "__pgz_inserted"` — true for rows inserted by this statement. */
export const insertedFlagColumn = (): ExprNode => ({
  kind: 'alias',
  expr: raw('(xmax = 0)'),
  alias: INSERTED_FLAG,
});
