import type { SqlCompiler } from '../../sql/compile.ts';
import type { InsertQueryBuilder } from '../insert-query-builder.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import { OnConflictBuilder, type OnConflictOptions } from '../on-conflict-builder.ts';
import type {
  AnyModel,
  BulkCreateOptions,
  ModelStatic,
  MutableOptions,
  Values,
} from '../options.ts';
import type { WrittenRows } from '../written-rows.ts';
import type { InsertOperation } from './insert-operation.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link BulkCreateOperation}. */
export type BulkCreateOperationServices = OperationServices &
  Readonly<{
    /** Model state. */
    registry: ModelRegistry;
    /** Value rules. */
    values: ModelValues;
    /** INSERT builder. */
    inserts: InsertQueryBuilder;
    /** ON CONFLICT builder. */
    conflicts: OnConflictBuilder;
    /** Conflict-aware inserts. */
    inserter: InsertOperation;
    /** Alignment of `ignoreDuplicates` results. */
    written: WrittenRows;
    /** SQL compiler. */
    compiler: SqlCompiler;
  }>;

// One `Model.bulkCreate` call: the built instances, hook-visible options and caller's options.
type BulkCreateCall = Readonly<{
  model: ModelStatic<AnyModel>;
  definition: ModelDefinition;
  instances: AnyModel[];
  opts: MutableOptions;
  options: BulkCreateOptions;
}>;

/**
 * `Model.bulkCreate`: one multi-row INSERT (Sequelize v6 conflict options or `onConflict`), or
 * one `save` per instance with `individualHooks` / nested includes.
 */
export class BulkCreateOperation extends ModelOperation<BulkCreateOperationServices> {
  /**
   * `Model.bulkCreate`.
   *
   * @param model - Model class.
   * @param records - Values per row.
   * @param options - Bulk create options.
   * @returns Instances with values returned by the database.
   * @throws Error when `onConflict` is combined with Sequelize v6 conflict options.
   */
  async bulkCreate<M extends AnyModel>(
    model: ModelStatic<M>,
    records: readonly Values[],
    options: BulkCreateOptions,
  ): Promise<M[]> {
    const { definition } = this.services.registry.state(model);
    const opts = BulkCreateOperation.#options(options);
    const instances = BulkCreateOperation.#instances(model, records, options);
    if (instances.length === 0) {
      return [];
    }
    const call = { model, definition, instances, opts, options };
    await this.#before(call);
    const created = await this.#create(call);
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'afterBulkCreate', created, opts);
    }
    return created as M[];
  }

  static #options(options: BulkCreateOptions): MutableOptions {
    if (
      options.onConflict !== undefined &&
      OnConflictBuilder.V6_OPTIONS.some((name) => options[name] !== undefined)
    ) {
      throw new Error(
        `onConflict cannot be combined with ${OnConflictBuilder.V6_OPTIONS.join(', ')}`,
      );
    }
    return {
      hooks: true,
      validate: false,
      individualHooks: options.include !== undefined,
      ...options,
    };
  }

  static #instances<M extends AnyModel>(
    model: ModelStatic<M>,
    records: readonly Values[],
    options: BulkCreateOptions,
  ): M[] {
    return records.map(
      (values) =>
        new model(values, options.include === undefined ? {} : { include: options.include }),
    );
  }

  async #before({ model, instances, opts }: BulkCreateCall): Promise<void> {
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'beforeBulkCreate', instances, opts);
    }
    if (opts['validate'] === true) {
      await this.services.lifecycle.validateAll(instances, opts['individualHooks'] === true);
    }
  }

  #create(call: BulkCreateCall): Promise<AnyModel[]> {
    return call.opts['individualHooks'] === true
      ? BulkCreateOperation.#saveEach(call)
      : this.#insert(call);
  }

  static async #saveEach({ instances, opts }: BulkCreateCall): Promise<AnyModel[]> {
    const {
      fields: _fields,
      individualHooks: _individual,
      ignoreDuplicates: _ignore,
      include: _include,
      ...saveOptions
    } = opts;
    await instances.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => instance.save({ ...saveOptions, validate: false, hooks: true })),
      Promise.resolve(),
    );
    return instances;
  }

  async #insert(call: BulkCreateCall): Promise<AnyModel[]> {
    const { model, definition, options } = call;
    const rows = this.#rows(call);
    if (options.onConflict !== undefined) {
      const onConflict = options.onConflict as OnConflictOptions<unknown>;
      const conflict = this.services.conflicts.build(definition, onConflict);
      return this.services.inserter.withConflict(model, rows, conflict, options);
    }
    return this.#insertRows(call, rows);
  }

  #rows({ definition, instances, opts, options }: BulkCreateCall): Values[] {
    const { values } = this.services;
    const now = new Date();
    const fields = options.fields as readonly string[] | undefined;
    const silent = opts['silent'] === true;
    return instances.map((instance) =>
      values.pick(
        values.withTimestamps(definition, instance.dataValues as Values, now, true, silent),
        fields,
      ),
    );
  }

  async #insertRows(call: BulkCreateCall, rows: Values[]): Promise<AnyModel[]> {
    const { model, definition, instances, options } = call;
    const { runtime } = this.services.registry.state(model);
    const { compiler, conflicts, inserts, lifecycle, written } = this.services;
    const insert = inserts.build(definition, rows, {
      returning: options.returning !== false,
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      ...conflicts.v6Bulk(definition, options),
    });
    const result = await runtime.execute(compiler.compile(insert), options);
    const returned =
      options.ignoreDuplicates === true
        ? written.aligned(definition, rows, result.rows)
        : result.rows;
    instances.forEach((instance, index) =>
      lifecycle.refresh(instance, definition, returned[index]),
    );
    return instances;
  }
}
