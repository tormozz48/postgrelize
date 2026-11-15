import type { SqlCompiler } from '../../sql/compile.ts';
import type { InsertQueryBuilder } from '../insert-query-builder.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
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

/** Collaborators of {@link BulkCreateOperation}. */
export type BulkCreateOperationServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Hooks, validation and refresh of instances. */
  lifecycle: InstanceLifecycle;
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

/**
 * `Model.bulkCreate`: one multi-row INSERT (Sequelize v6 conflict options or `onConflict`), or
 * one `save` per instance with `individualHooks` / nested includes.
 */
export class BulkCreateOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #inserts: InsertQueryBuilder;
  readonly #conflicts: OnConflictBuilder;
  readonly #inserter: InsertOperation;
  readonly #written: WrittenRows;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: BulkCreateOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#inserts = services.inserts;
    this.#conflicts = services.conflicts;
    this.#inserter = services.inserter;
    this.#written = services.written;
    this.#compiler = services.compiler;
  }

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
    const { definition, runtime } = this.#registry.state(model);
    if (
      options.onConflict !== undefined &&
      OnConflictBuilder.V6_OPTIONS.some((name) => options[name] !== undefined)
    ) {
      throw new Error(
        `onConflict cannot be combined with ${OnConflictBuilder.V6_OPTIONS.join(', ')}`,
      );
    }
    const opts: MutableOptions = {
      hooks: true,
      validate: false,
      individualHooks: options.include !== undefined,
      ...options,
    };
    const instances = records.map(
      (values) =>
        new model(values, options.include === undefined ? {} : { include: options.include }),
    );
    if (instances.length === 0) {
      return [];
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeBulkCreate', instances, opts);
    }
    if (opts['validate'] === true) {
      await this.#lifecycle.validateAll(instances, opts['individualHooks'] === true);
    }
    const created = await (async (): Promise<M[]> => {
      if (opts['individualHooks'] === true) {
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
      const now = new Date();
      const fields = options.fields as readonly string[] | undefined;
      const rows = instances.map((instance) =>
        this.#values.pick(
          this.#values.withTimestamps(
            definition,
            instance.dataValues as Values,
            now,
            true,
            opts['silent'] === true,
          ),
          fields,
        ),
      );
      if (options.onConflict !== undefined) {
        return this.#inserter.withConflict(
          model,
          rows,
          this.#conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>),
          options,
        );
      }
      const insert = this.#inserts.build(definition, rows, {
        returning: options.returning !== false,
        ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
        ...this.#conflicts.v6Bulk(definition, options),
      });
      const result = await runtime.execute(this.#compiler.compile(insert), options);
      const returned =
        options.ignoreDuplicates === true
          ? this.#written.aligned(definition, rows, result.rows)
          : result.rows;
      instances.forEach((instance, index) =>
        this.#lifecycle.refresh(instance, definition, returned[index]),
      );
      return instances;
    })();
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterBulkCreate', created, opts);
    }
    return created;
  }
}
