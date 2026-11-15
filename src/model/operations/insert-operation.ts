import type { Subquery } from '../../expressions/methods.ts';
import type { InsertNode, OnConflictNode } from '../../sql/ast.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { InsertQueryBuilder } from '../insert-query-builder.ts';
import type { ModelDefinition } from '../model-definition.ts';
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
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link InsertOperation}. */
export type InsertOperationServices = OperationServices &
  Readonly<{
    /** Model state. */
    registry: ModelRegistry;
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

type ConflictOptions = Readonly<{ onConflict?: unknown }>;

/**
 * `INSERT ... ON CONFLICT ... RETURNING` writes that return the written rows with `wasInserted`:
 * `Model.insert`, `Model.insertFrom` and the `onConflict` paths of `create` / `bulkCreate`.
 */
export class InsertOperation extends ModelOperation<InsertOperationServices> {
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
    const { definition } = this.services.registry.state(model);
    const now = new Date();
    const records: readonly Values[] = Array.isArray(values) ? values : [values as Values];
    if (records.length === 0) {
      return [];
    }
    const opts: MutableOptions = { hooks: true, validate: false, ...options };
    const instances = records.map((record) => new model(record));
    await this.#before(model, instances, opts);
    const inserted = await this.#write(model, definition, instances, now, options);
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'afterBulkCreate', inserted, opts);
    }
    return inserted;
  }

  async #before(model: object, instances: readonly AnyModel[], opts: MutableOptions) {
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'beforeBulkCreate', instances, opts);
    }
    if (opts['validate'] === true) {
      await this.services.lifecycle.validateAll(instances, false);
    }
  }

  #write<M extends AnyModel>(
    model: ModelStatic<M>,
    definition: ModelDefinition,
    instances: readonly AnyModel[],
    now: Date,
    options: InsertOptions,
  ): Promise<M[]> {
    const rows = this.#rows(definition, instances, now, options);
    const onConflict = this.#onConflict(definition, options);
    return this.withConflict(model, rows, onConflict, options);
  }

  #rows(
    definition: ModelDefinition,
    instances: readonly AnyModel[],
    now: Date,
    options: InsertOptions,
  ): Values[] {
    const { values } = this.services;
    return instances.map((instance) =>
      values.pick(
        values.withTimestamps(definition, instance.dataValues as Values, now, true, false),
        options.fields as readonly string[] | undefined,
      ),
    );
  }

  #onConflict(definition: ModelDefinition, options: ConflictOptions): OnConflictNode | undefined {
    return options.onConflict === undefined
      ? undefined
      : this.services.conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>);
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
    const { definition, runtime } = this.services.registry.state(model);
    const onConflict = this.#onConflict(definition, options);
    const node = this.services.inserts.fromSelect(
      definition,
      options.columns as readonly string[],
      source.build(),
      onConflict,
      this.#returning(definition),
    );
    const old = await this.services.returningOld.enabled(runtime, options);
    return this.#execute(model, node, old, options);
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
    const { definition, runtime } = this.services.registry.state(model);
    const old = await this.services.returningOld.enabled(runtime, options);
    const insert = this.services.inserts.build(definition, rows, {
      ...(onConflict === undefined ? {} : { onConflict }),
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      returning: this.#returning(definition),
    });
    return this.#execute(model, insert, old, options);
  }

  #returning(definition: ModelDefinition) {
    const { columns, conflicts } = this.services;
    return [...columns.returningAll(definition), conflicts.insertedFlagColumn()];
  }

  async #execute<M extends AnyModel>(
    model: ModelStatic<M>,
    node: InsertNode,
    old: boolean,
    options: QueryOptionsBase,
  ): Promise<M[]> {
    const { definition, runtime } = this.services.registry.state(model);
    const { compiler, returningOld, written } = this.services;
    const statement = old ? returningOld.node(definition, node) : node;
    const result = await runtime.execute(compiler.compile(statement), options);
    return result.rows.map((row) => written.inserted(model, row, old));
  }
}
