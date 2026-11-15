import type { Subquery } from '../../expressions/methods.ts';
import type { OnConflictNode } from '../../sql/ast.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { InsertQueryBuilder } from '../insert-query-builder.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type { OnConflictBuilder, OnConflictOptions } from '../on-conflict-builder.ts';
import type {
  AnyModel,
  InsertFromOptions,
  InsertOptions,
  ModelStatic,
  MutableOptions,
  Values,
} from '../options.ts';
import type { ReturningOld } from '../returning-old.ts';
import type { QueryOptionsBase } from '../runtime.ts';
import type { WrittenRows } from '../written-rows.ts';

/** Collaborators of {@link InsertOperation}. */
export type InsertOperationServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Hooks and validation. */
  lifecycle: InstanceLifecycle;
  /** Value rules. */
  values: ModelValues;
  /** RETURNING lists. */
  columns: AttributeColumns;
  /** INSERT builder. */
  inserts: InsertQueryBuilder;
  /** ON CONFLICT builder. */
  conflicts: OnConflictBuilder;
  /** `returningOld` support. */
  returningOld: ReturningOld;
  /** Instances of returned rows. */
  written: WrittenRows;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/**
 * `INSERT ... ON CONFLICT ... RETURNING` writes that return the written rows with `wasInserted`:
 * `Model.insert`, `Model.insertFrom` and the `onConflict` paths of `create` / `bulkCreate`.
 */
export class InsertOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #inserts: InsertQueryBuilder;
  readonly #conflicts: OnConflictBuilder;
  readonly #returningOld: ReturningOld;
  readonly #written: WrittenRows;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: InsertOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#inserts = services.inserts;
    this.#conflicts = services.conflicts;
    this.#returningOld = services.returningOld;
    this.#written = services.written;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.insert`: inserts rows with `INSERT ... ON CONFLICT` and returns the written rows.
   *
   * @param model - Model class.
   * @param values - One row or several rows.
   * @param options - Insert options.
   * @returns Instances of the rows written by the statement.
   */
  async insert<M extends AnyModel>(
    model: ModelStatic<M>,
    values: Values | readonly Values[],
    options: InsertOptions,
  ): Promise<M[]> {
    const { definition } = this.#registry.state(model);
    const now = new Date();
    const records: readonly Values[] = Array.isArray(values) ? values : [values as Values];
    if (records.length === 0) {
      return [];
    }
    const opts: MutableOptions = { hooks: true, validate: false, ...options };
    const instances = records.map((record) => new model(record));
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeBulkCreate', instances, opts);
    }
    if (opts['validate'] === true) {
      await this.#lifecycle.validateAll(instances, false);
    }
    const rows = instances.map((instance) =>
      this.#values.pick(
        this.#values.withTimestamps(definition, instance.dataValues as Values, now, true, false),
        options.fields as readonly string[] | undefined,
      ),
    );
    const onConflict =
      options.onConflict === undefined
        ? undefined
        : this.#conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>);
    const inserted = await this.withConflict(model, rows, onConflict, options);
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterBulkCreate', inserted, opts);
    }
    return inserted;
  }

  /**
   * `Model.insertFrom`: `INSERT INTO ... SELECT` from a subquery.
   *
   * @param model - Model class.
   * @param source - Subquery whose columns match `options.columns`.
   * @param options - Target columns, `onConflict` and query options.
   * @returns Written rows.
   */
  async insertFrom<M extends AnyModel>(
    model: ModelStatic<M>,
    source: Subquery,
    options: InsertFromOptions,
  ): Promise<M[]> {
    const { definition, runtime } = this.#registry.state(model);
    const onConflict =
      options.onConflict === undefined
        ? undefined
        : this.#conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>);
    const node = this.#inserts.fromSelect(
      definition,
      options.columns as readonly string[],
      source.build(),
      onConflict,
      [...this.#columns.returningAll(definition), this.#conflicts.insertedFlagColumn()],
    );
    const old = await this.#returningOld.enabled(runtime, options);
    const result = await runtime.execute(
      this.#compiler.compile(old ? this.#returningOld.node(definition, node) : node),
      options,
    );
    return result.rows.map((row) => this.#written.inserted(model, row, old));
  }

  /**
   * Inserts attribute-keyed rows with an optional ON CONFLICT clause and returns the written rows
   * with `wasInserted`.
   *
   * @param model - Model class.
   * @param rows - Values by attribute name.
   * @param onConflict - ON CONFLICT clause.
   * @param options - Query options, `overriding`, `returningOld`.
   * @returns Instances of the written rows.
   */
  async withConflict<M extends AnyModel>(
    model: ModelStatic<M>,
    rows: readonly Values[],
    onConflict: OnConflictNode | undefined,
    options: QueryOptionsBase &
      Readonly<{ overriding?: 'system' | 'user'; returningOld?: boolean }>,
  ): Promise<M[]> {
    const { definition, runtime } = this.#registry.state(model);
    const old = await this.#returningOld.enabled(runtime, options);
    const insert = this.#inserts.build(definition, rows, {
      ...(onConflict === undefined ? {} : { onConflict }),
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      returning: [...this.#columns.returningAll(definition), this.#conflicts.insertedFlagColumn()],
    });
    const result = await runtime.execute(
      this.#compiler.compile(old ? this.#returningOld.node(definition, insert) : insert),
      options,
    );
    return result.rows.map((row) => this.#written.inserted(model, row, old));
  }
}
