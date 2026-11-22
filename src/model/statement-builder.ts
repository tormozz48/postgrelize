import { WriteStatement } from '../expressions/methods.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { DeleteQueryBuilder } from './delete-query-builder.ts';
import type { InsertQueryBuilder } from './insert-query-builder.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { ModelValues } from './model-values.ts';
import type { AnyModel, ModelStatic, Values } from './options.ts';
import type { UpdateQueryBuilder } from './update-query-builder.ts';
import type { WhereOptions } from './types.ts';

/**
 * Options of `Model.deleteStatement()` and `Model.updateStatement()`.
 *
 * @example
 * ```ts
 * const options: WriteStatementOptions<Task> = { where: { done: true }, returning: true };
 * ```
 */
export type WriteStatementOptions<T = Values> = Readonly<{
  /** Rows to change; all rows when omitted. The default scope applies. */
  where?: WhereOptions<T>;
  /** Add `RETURNING` with all columns, so that the CTE can be read. */
  returning?: boolean;
}>;

/**
 * Options of `Model.updateStatement()`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: UpdateStatementOptions<Task> = { where: { id: 1 }, returning: true, silent: true };
 * ```
 */
export type UpdateStatementOptions<T = Values> = WriteStatementOptions<T> &
  Readonly<{
    /** Leave `updatedAt` unchanged. */
    silent?: boolean;
  }>;

/** Builds the INSERT / UPDATE / DELETE statements of data-modifying CTEs. No hooks or validation run. */
export class StatementBuilder {
  readonly #registry: ModelRegistry;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #updates: UpdateQueryBuilder;
  readonly #deletes: DeleteQueryBuilder;
  readonly #inserts: InsertQueryBuilder;

  /**
   * @param services - Model state, value rules and statement builders.
   */
  constructor(
    services: Readonly<{
      registry: ModelRegistry;
      values: ModelValues;
      columns: AttributeColumns;
      updates: UpdateQueryBuilder;
      deletes: DeleteQueryBuilder;
      inserts: InsertQueryBuilder;
    }>,
  ) {
    this.#registry = services.registry;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#updates = services.updates;
    this.#deletes = services.deletes;
    this.#inserts = services.inserts;
  }

  /**
   * An UPDATE statement.
   *
   * @param model - Model class.
   * @param values - New attribute values.
   * @param options - Condition, RETURNING, `silent`.
   * @returns Statement for a CTE.
   */
  update(
    model: ModelStatic<AnyModel>,
    values: Values,
    options: UpdateStatementOptions,
  ): WriteStatement {
    return new WriteStatement(() => this.#updateNode(model, values, options));
  }

  #updateNode(model: ModelStatic<AnyModel>, values: Values, options: UpdateStatementOptions) {
    const { definition, runtime } = this.#registry.state(model);
    const changes = this.#values.withTimestamps(
      definition,
      values,
      new Date(),
      false,
      options.silent === true,
    );
    return this.#updates.build(
      definition,
      this.#columns.setItems(
        definition,
        changes,
        this.#columns.whereCompiler(definition, undefined),
      ),
      this.#where(model, options, true),
      this.#build(runtime.inAsAnyThreshold, options),
    );
  }

  /**
   * A DELETE statement (a real delete, also for paranoid models).
   *
   * @param model - Model class.
   * @param options - Condition and RETURNING.
   * @returns Statement for a CTE.
   */
  delete(model: ModelStatic<AnyModel>, options: WriteStatementOptions): WriteStatement {
    return new WriteStatement(() =>
      this.#deletes.build(
        this.#registry.state(model).definition,
        this.#where(model, options, false),
        this.#build(this.#registry.state(model).runtime.inAsAnyThreshold, options),
      ),
    );
  }

  /**
   * An INSERT statement of attribute-keyed rows (defaults and timestamps are filled in).
   *
   * @param model - Model class.
   * @param rows - Rows to insert.
   * @param options - RETURNING.
   * @returns Statement for a CTE.
   * @throws Error without rows.
   */
  insert(
    model: ModelStatic<AnyModel>,
    rows: readonly Values[],
    options: Pick<WriteStatementOptions, 'returning'>,
  ): WriteStatement {
    if (rows.length === 0) {
      throw new Error('insertStatement needs at least one row');
    }
    return new WriteStatement(() => {
      const { definition } = this.#registry.state(model);
      const initial = this.#values.initial(definition);
      const full = rows.map((row) =>
        this.#values.withTimestamps(definition, { ...initial, ...row }, new Date(), true, false),
      );
      return this.#inserts.build(definition, full, { returning: options.returning === true });
    });
  }

  #where(model: ModelStatic<AnyModel>, options: WriteStatementOptions, paranoid: boolean): unknown {
    const { definition } = this.#registry.state(model);
    const scoped = this.#registry.scoped(model, { where: options.where } as never) as {
      where?: unknown;
    };
    return paranoid ? this.#columns.paranoid(definition, scoped.where, undefined) : scoped.where;
  }

  #build(threshold: number | undefined, options: WriteStatementOptions) {
    return {
      ...(options.returning === true ? { returning: true } : {}),
      ...(threshold === undefined ? {} : { inAsAnyThreshold: threshold }),
    };
  }
}
