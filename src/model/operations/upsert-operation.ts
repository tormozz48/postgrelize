import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { InsertQueryBuilder } from '../insert-query-builder.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import { InstanceState } from '../instance-state.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import { OnConflictBuilder, type OnConflictOptions } from '../on-conflict-builder.ts';
import type { AnyModel, ModelStatic, MutableOptions, UpsertOptions, Values } from '../options.ts';
import type { WrittenRows } from '../written-rows.ts';

/** Collaborators of {@link UpsertOperation}. */
export type UpsertOperationServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Hooks and refresh of instances. */
  lifecycle: InstanceLifecycle;
  /** Value rules. */
  values: ModelValues;
  /** RETURNING lists. */
  columns: AttributeColumns;
  /** INSERT builder. */
  inserts: InsertQueryBuilder;
  /** ON CONFLICT builder. */
  conflicts: OnConflictBuilder;
  /** Marker columns of returned rows. */
  written: WrittenRows;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/** `Model.upsert`: `INSERT ... ON CONFLICT DO UPDATE` with Sequelize v6 target rules or `onConflict`. */
export class UpsertOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #inserts: InsertQueryBuilder;
  readonly #conflicts: OnConflictBuilder;
  readonly #written: WrittenRows;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: UpsertOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#inserts = services.inserts;
    this.#conflicts = services.conflicts;
    this.#written = services.written;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.upsert`.
   *
   * @param model - Model class.
   * @param values - Attribute values.
   * @param options - Upsert options.
   * @returns `[instance, null]` like Sequelize v6, or `[instance, created]` with `onConflict`.
   */
  async upsert<M extends AnyModel>(
    model: ModelStatic<M>,
    values: Values,
    options: UpsertOptions,
  ): Promise<[M, boolean | null]> {
    const { definition, runtime } = this.#registry.state(model);
    const opts: MutableOptions = { hooks: true, validate: true, returning: true, ...options };
    const instance = new model(values);
    const now = new Date();
    const provided = Object.keys(values).filter((name) => definition.attributes.has(name));
    const updatable =
      options.fields === undefined
        ? provided
        : provided.filter((name) => options.fields?.includes(name as never));
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true, fields: updatable });
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeUpsert', values, opts);
    }
    const insertValues = this.#withoutGeneratedKey(definition, values, {
      ...this.#values.withTimestamps(definition, instance.dataValues as Values, now, true, false),
      ...(definition.updatedAt !== undefined &&
      values[definition.updatedAt] !== undefined &&
      values[definition.updatedAt] !== null
        ? { [definition.updatedAt]: (instance.dataValues as Values)[definition.updatedAt] }
        : {}),
    });
    const onConflict =
      options.onConflict === undefined
        ? this.#conflicts.v6Upsert(definition, insertValues, updatable, options.conflictFields)
        : this.#conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>);
    const insert = this.#inserts.build(definition, [insertValues], {
      onConflict,
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      returning: [...this.#columns.returningAll(definition), this.#conflicts.insertedFlagColumn()],
    });
    const result = await runtime.execute(this.#compiler.compile(insert), options);
    const row = result.rows[0];
    const flag = row?.[OnConflictBuilder.INSERTED_FLAG];
    this.#lifecycle.refresh(
      instance,
      definition,
      row === undefined ? undefined : this.#written.withoutMarkers(row),
    );
    if (options.onConflict !== undefined) {
      instance[InstanceState.key]().wasInserted = flag === true;
    }
    const upserted: [M, boolean | null] = [
      instance,
      options.onConflict === undefined ? null : flag === true,
    ];
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterUpsert', upserted, opts);
    }
    return upserted;
  }

  /** Leaves out an auto-generated primary key that was not provided (so the sequence fills it). */
  #withoutGeneratedKey(definition: ModelDefinition, provided: Values, values: Values): Values {
    const key = definition.primaryKeys[0];
    return key !== undefined &&
      !(key in provided) &&
      definition.attributes.get(key)?.defaultValue === undefined
      ? Object.fromEntries(Object.entries(values).filter(([name]) => name !== key))
      : values;
  }
}
