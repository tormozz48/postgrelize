import { excluded, SqlExpression, type Fn, type Literal } from '../expressions/methods.ts';
import { SqlAst, type ConflictTarget, type ExprNode, type OnConflictNode } from '../sql/ast.ts';
import { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { BulkCreateOptions, Values } from './options.ts';
import { V6ConflictBuilder } from './v6-conflict-builder.ts';
import type { WhereOptions } from './types.ts';

const ast = new SqlAst();

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
 * @postgrelize
 * @example
 * ```ts
 * const rows = [{ tenantId: 1, key: 'views', hits: 1, version: 2 }];
 * await Product.bulkCreate(rows, {
 *   onConflict: {
 *     target: ['tenantId', 'key'],
 *     action: {
 *       update: { hits: literal('"Product"."hits" + EXCLUDED."hits"'), updatedAt: fn('now') },
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

const isConstraintTarget = (
  target: OnConflictTarget<unknown>,
): target is OnConflictConstraintTarget => !Array.isArray(target) && 'constraint' in target;

/**
 * Builds `INSERT ... ON CONFLICT` clauses: the `onConflict` option (PostgreSQL extension) and the
 * Sequelize v6 rules of `bulkCreate` (`ignoreDuplicates`, `updateOnDuplicate`, `conflictAttributes`,
 * `conflictWhere`) and `upsert` (conflict target from unique keys / indexes).
 */
export class OnConflictBuilder {
  /** Column added to `RETURNING` to tell inserted rows from updated ones. */
  static readonly INSERTED_FLAG = '__pgz_inserted';
  /** Sequelize v6 `bulkCreate` conflict options, not combinable with `onConflict`. */
  static readonly V6_OPTIONS = [
    'ignoreDuplicates',
    'updateOnDuplicate',
    'conflictAttributes',
    'conflictWhere',
  ] as const;

  readonly #columns: AttributeColumns;
  readonly #v6: V6ConflictBuilder;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
    this.#v6 = new V6ConflictBuilder(columns);
  }

  /**
   * Validates `onConflict` and converts it into an AST node. The target table must be aliased with
   * the model name so `col()` and `where` refer to the existing row.
   *
   * @param definition - Model definition.
   * @param options - `onConflict` option.
   * @returns ON CONFLICT node.
   * @throws Error for unknown attributes, empty targets or an update without target.
   */
  build(definition: ModelDefinition, options: OnConflictOptions<unknown>): OnConflictNode {
    const target =
      options.target === undefined ? undefined : this.#target(definition, options.target);
    if (options.action === 'nothing') {
      return { ...(target === undefined ? {} : { target }), action: { kind: 'nothing' } };
    }
    if (target === undefined) {
      throw new Error('onConflict: target is required when action is an update');
    }
    return { target, action: this.#updateAction(definition, options.action) };
  }

  /**
   * `(xmax = 0) AS "__pgz_inserted"` — true for rows inserted by this statement.
   *
   * @returns RETURNING column.
   */
  insertedFlagColumn(): ExprNode {
    return {
      kind: 'alias',
      expr: ast.raw('(xmax = 0)'),
      alias: OnConflictBuilder.INSERTED_FLAG,
    };
  }

  /**
   * ON CONFLICT clause of Sequelize v6 `bulkCreate` options.
   *
   * @param definition - Model definition.
   * @param options - `updateOnDuplicate`, `conflictAttributes`, `conflictWhere`, `ignoreDuplicates`.
   * @returns `{ onConflict }`, or `{}` without conflict handling.
   * @throws Error for an empty `updateOnDuplicate`.
   */
  v6Bulk(
    definition: ModelDefinition,
    options: BulkCreateOptions,
  ): Readonly<{ onConflict?: OnConflictNode }> {
    return this.#v6.bulk(definition, options);
  }

  /**
   * ON CONFLICT clause of Sequelize v6 `upsert`: the target is the first unique key (or unique
   * index) containing an updated attribute, otherwise the primary key.
   *
   * @param definition - Model definition.
   * @param insertValues - Inserted values.
   * @param updatable - Attributes updated on conflict.
   * @param conflictFields - `conflictFields` option (column names).
   * @returns ON CONFLICT node.
   */
  v6Upsert(
    definition: ModelDefinition,
    insertValues: Values,
    updatable: readonly string[],
    conflictFields: readonly string[] | undefined,
  ): OnConflictNode {
    return this.#v6.upsert(definition, insertValues, updatable, conflictFields);
  }

  #updateAction(
    definition: ModelDefinition,
    action: OnConflictUpdateAction<unknown>,
  ): OnConflictNode['action'] {
    const ctx = new WhereCompiler({
      ...this.#columns.whereCompiler(definition, definition.name).context,
      allowExcluded: true,
    });
    const set = this.#columns.setItems(
      definition,
      this.#updateValues(definition, action.update),
      ctx,
    );
    const where = WhereCompiler.isEmpty(action.where) ? undefined : ctx.compile(action.where);
    return { kind: 'update', set, ...(where === undefined ? {} : { where }) };
  }

  #targetItem(definition: ModelDefinition, item: unknown): ExprNode {
    return item instanceof SqlExpression
      ? this.#columns.whereCompiler(definition, undefined).toExpr(item)
      : ast.ident(assertAttribute(definition, String(item)));
  }

  #target(definition: ModelDefinition, target: OnConflictTarget<unknown>): ConflictTarget {
    if (isConstraintTarget(target)) {
      return { kind: 'constraint', name: target.constraint };
    }
    const columnsTarget = (
      Array.isArray(target) ? { columns: target } : target
    ) as OnConflictColumnsTarget<unknown>;
    if (columnsTarget.columns.length === 0) {
      throw new Error('onConflict: target columns must not be empty');
    }
    const where = WhereCompiler.isEmpty(columnsTarget.where)
      ? undefined
      : this.#columns.whereCompiler(definition, undefined).compile(columnsTarget.where);
    return {
      kind: 'columns',
      items: columnsTarget.columns.map((item) => this.#targetItem(definition, item)),
      ...(where === undefined ? {} : { where }),
    };
  }

  #updateValues(
    definition: ModelDefinition,
    update: OnConflictUpdate<unknown>,
  ): Readonly<Record<string, unknown>> {
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
  }
}
