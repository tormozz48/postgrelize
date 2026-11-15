import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { InsertQueryBuilder } from '../insert-query-builder.ts';
import { InstanceState } from '../instance-state.ts';
import type { ModelDefinition } from '../model-definition.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import { OnConflictBuilder, type OnConflictOptions } from '../on-conflict-builder.ts';
import type { AnyModel, ModelStatic, MutableOptions, UpsertOptions, Values } from '../options.ts';
import type { WrittenRows } from '../written-rows.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link UpsertOperation}. */
export type UpsertOperationServices = OperationServices &
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
    /** Marker columns of returned rows. */
    written: WrittenRows;
    /** SQL compiler. */
    compiler: SqlCompiler;
  }>;

type UpsertResult = [AnyModel, boolean | null];

// One `Model.upsert` call: the built instance, both option objects and the updatable attributes.
type UpsertCall = Readonly<{
  model: ModelStatic<AnyModel>;
  definition: ModelDefinition;
  instance: AnyModel;
  values: Values;
  opts: MutableOptions;
  options: UpsertOptions;
  now: Date;
  updatable: readonly string[];
}>;

/** `Model.upsert`: `INSERT ... ON CONFLICT DO UPDATE` with Sequelize v6 target rules or `onConflict`. */
export class UpsertOperation extends ModelOperation<UpsertOperationServices> {
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
    const { definition } = this.services.registry.state(model);
    const opts: MutableOptions = { hooks: true, validate: true, returning: true, ...options };
    const instance = new model(values);
    const now = new Date();
    const updatable = UpsertOperation.#updatable(definition, values, options);
    const call = { model, definition, instance, values, opts, options, now, updatable };
    await this.#before(call);
    const upserted = await this.#write(call);
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'afterUpsert', upserted, opts);
    }
    return upserted as [M, boolean | null];
  }

  static #updatable(definition: ModelDefinition, values: Values, options: UpsertOptions): string[] {
    const provided = Object.keys(values).filter((name) => definition.attributes.has(name));
    return options.fields === undefined
      ? provided
      : provided.filter((name) => options.fields?.includes(name as never));
  }

  async #before({ model, instance, values, opts, updatable }: UpsertCall): Promise<void> {
    if (opts['validate'] === true) {
      await instance.validate({ hooks: opts['hooks'] === true, fields: updatable });
    }
    if (opts['hooks'] === true) {
      await this.services.lifecycle.runHooks(model, 'beforeUpsert', values, opts);
    }
  }

  async #write(call: UpsertCall): Promise<UpsertResult> {
    const { runtime } = this.services.registry.state(call.model);
    const insert = this.#statement(call);
    const result = await runtime.execute(this.services.compiler.compile(insert), call.options);
    return this.#refresh(call, result.rows[0]);
  }

  #statement(call: UpsertCall) {
    const { definition, options, updatable } = call;
    const { columns, conflicts, inserts } = this.services;
    const insertValues = this.#insertValues(call);
    const onConflict =
      options.onConflict === undefined
        ? conflicts.v6Upsert(definition, insertValues, updatable, options.conflictFields)
        : conflicts.build(definition, options.onConflict as OnConflictOptions<unknown>);
    return inserts.build(definition, [insertValues], {
      onConflict,
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      returning: [...columns.returningAll(definition), conflicts.insertedFlagColumn()],
    });
  }

  #insertValues({ definition, instance, values, now }: UpsertCall): Values {
    const data = instance.dataValues as Values;
    return this.#withoutGeneratedKey(definition, values, {
      ...this.services.values.withTimestamps(definition, data, now, true, false),
      ...(definition.updatedAt !== undefined &&
      values[definition.updatedAt] !== undefined &&
      values[definition.updatedAt] !== null
        ? { [definition.updatedAt]: data[definition.updatedAt] }
        : {}),
    });
  }

  #refresh(
    { definition, instance, options }: UpsertCall,
    row: Readonly<Record<string, unknown>> | undefined,
  ): UpsertResult {
    const flag = row?.[OnConflictBuilder.INSERTED_FLAG];
    this.services.lifecycle.refresh(
      instance,
      definition,
      row === undefined ? undefined : this.services.written.withoutMarkers(row),
    );
    if (options.onConflict !== undefined) {
      InstanceState.of(instance).wasInserted = flag === true;
    }
    return [instance, options.onConflict === undefined ? null : flag === true];
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
