import { AssertionError } from 'node:assert';
import { isDeepStrictEqual } from 'node:util';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { JoinSourceBuilder } from '../join-source-builder.ts';
import type { ModelRegistry, ModelState } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type { AnyModel, ModelStatic, MutableOptions, UpdateOptions, Values } from '../options.ts';
import type { ReturningOld } from '../returning-old.ts';
import type { UpdateQueryBuilder } from '../update-query-builder.ts';
import type { WrittenRows } from '../written-rows.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link UpdateOperation}. */
export type UpdateOperationServices = OperationServices &
  Readonly<{
    /** Model state and scopes. */
    registry: ModelRegistry;
    /** Value rules. */
    values: ModelValues;
    /** SET items, paranoid filter. */
    columns: AttributeColumns;
    /** UPDATE builder. */
    updates: UpdateQueryBuilder;
    /** `from` relations. */
    joins: JoinSourceBuilder;
    /** `returningOld` support. */
    returningOld: ReturningOld;
    /** Instances of returned rows. */
    written: WrittenRows;
    /** SQL compiler. */
    compiler: SqlCompiler;
  }>;

type UpdateRows = Readonly<{ count: number; rows: AnyModel[] }>;

type UpdateResult<M> = [affectedCount: number, affectedRows?: M[]];

// One `Model.update` call: the hook-visible options and the caller's options.
type UpdateCall = Readonly<{
  model: ModelStatic<AnyModel>;
  state: ModelState;
  opts: MutableOptions;
  options: UpdateOptions;
  where: unknown;
  individual: boolean;
}>;

/** `Model.update`: bulk UPDATE with validation, bulk / individual hooks, `from` and `returning`. */
export class UpdateOperation extends ModelOperation<UpdateOperationServices> {
  /**
   * `Model.update`.
   *
   * @param model - Model class.
   * @param values - New attribute values.
   * @param options - Update options.
   * @returns `[affectedCount]`, or `[affectedCount, rows]` with `returning: true`.
   * @throws Error for `individualHooks` with `from`, or `returningOld` without `returning`.
   */
  async update<M extends AnyModel>(
    model: ModelStatic<M>,
    values: Values,
    options: UpdateOptions,
  ): Promise<UpdateResult<M>> {
    const opts: MutableOptions = {
      validate: true,
      hooks: true,
      individualHooks: false,
      ...this.services.registry.scoped(model, options),
      attributes: { ...values },
    };
    if (opts['where'] === undefined || opts['where'] === null) {
      throw new AssertionError({ message: 'Missing where attribute in the options parameter' });
    }
    if (opts['validate'] === true) {
      await this.#validate(model, values, opts);
    }
    return (await this.#bulkUpdate(model, opts, options)) as UpdateResult<M>;
  }

  async #validate(model: ModelStatic<AnyModel>, values: Values, opts: MutableOptions) {
    const { definition } = this.services.registry.state(model);
    await new model(values, { isNewRecord: false }).validate({
      hooks: opts['hooks'] === true,
      skip: [...definition.attributes.keys()].filter((name) => !(name in values)),
    });
  }

  @ModelOperation.bulkHooks('beforeBulkUpdate', 'afterBulkUpdate')
  async #bulkUpdate(
    model: ModelStatic<AnyModel>,
    opts: MutableOptions,
    options: UpdateOptions,
  ): Promise<UpdateResult<AnyModel>> {
    const state = this.services.registry.state(model);
    const paranoid = opts['paranoid'] as boolean | undefined;
    const where = this.services.columns.paranoid(state.definition, opts['where'], paranoid);
    const individual = opts['individualHooks'] === true;
    const call = { model, state, opts, options, where, individual };
    UpdateOperation.#check(call);
    const saved = call.individual ? await this.#beforeEach(call) : undefined;
    const updated = saved ?? (await this.#execute(call));
    if (call.individual) {
      await this.services.lifecycle.runEach(model, 'afterUpdate', updated.rows, opts);
    }
    // like v6, `individualHooks` returns the instances even without `returning`
    return options.returning === true || call.individual
      ? [updated.count, updated.rows]
      : [updated.count];
  }

  // Runs `beforeUpdate` on every target. Changes the hooks made become part of the UPDATE when every
  // row ends up with the same changes; otherwise the rows are saved one by one (v6).
  async #beforeEach(call: UpdateCall): Promise<UpdateRows | undefined> {
    const { model, where, opts, options } = call;
    const queryOptions = this.services.values.queryOptions(options);
    const targets = await model.findAll({
      where: where as never,
      ...queryOptions,
      paranoid: false,
    });
    targets.forEach((instance) => instance.set(opts['attributes'] as Values));
    await this.services.lifecycle.runEach(model, 'beforeUpdate', targets, opts);
    const changes = targets.map((instance) => UpdateOperation.#changedValues(instance));
    if (changes.some((entry) => !isDeepStrictEqual(entry, changes[0]))) {
      return UpdateOperation.#saveEach(targets, queryOptions);
    }
    UpdateOperation.#adopt(call, changes[0] ?? {});
    return undefined;
  }

  static async #saveEach(targets: readonly AnyModel[], queryOptions: object): Promise<UpdateRows> {
    const save = (instance: AnyModel) =>
      instance.save({ ...queryOptions, hooks: false, validate: false });
    const rows = await Promise.all(targets.map(save));
    return { count: rows.length, rows };
  }

  // The changes made by the hooks, shared by every row, replace the values of the UPDATE.
  static #adopt({ opts, options }: UpdateCall, common: Values): void {
    opts['attributes'] = { ...common };
    if (options.fields !== undefined) {
      opts['fields'] = [...new Set([...options.fields, ...Object.keys(common)])];
    }
  }

  static #changedValues(instance: AnyModel): Values {
    const names = instance.changed();
    return Object.fromEntries(
      (names === false ? [] : names).map((name) => [name, instance.get(name)]),
    );
  }

  static #check({ options, individual }: UpdateCall): void {
    if (individual && options.from !== undefined) {
      throw new Error('update: individualHooks cannot be combined with from');
    }
    if (options.returningOld === true && options.returning !== true) {
      throw new Error('update: returningOld requires returning: true');
    }
  }

  async #execute(call: UpdateCall): Promise<UpdateRows> {
    const { definition, runtime } = call.state;
    const { returningOld, compiler, written } = this.services;
    const old = await returningOld.enabled(runtime, call.options);
    const node = this.#statement(call);
    const statement = old ? returningOld.node(definition, node) : node;
    const result = await runtime.execute(compiler.compile(statement), call.options);
    const rows = result.rows.map((row) => written.instance(call.model, row, old));
    return { count: result.rowCount, rows };
  }

  #statement(call: UpdateCall) {
    const { definition, runtime } = call.state;
    const { columns, joins, updates } = this.services;
    const from = joins.build(call.options.from);
    const ctx = columns.whereCompiler(definition, from.length === 0 ? undefined : definition.name);
    const threshold = runtime.inAsAnyThreshold;
    return updates.build(
      definition,
      columns.setItems(definition, this.#changes(call), ctx),
      call.where,
      {
        ...(from.length === 0 ? {} : { from }),
        ...(call.options.returning === true || call.individual ? { returning: true } : {}),
        ...(threshold === undefined ? {} : { inAsAnyThreshold: threshold }),
      },
    );
  }

  #changes({ state: { definition }, opts, options }: UpdateCall): Values {
    const { values } = this.services;
    const fields = (opts['fields'] ?? options.fields) as readonly string[] | undefined;
    const picked = values.pick(opts['attributes'] as Values, fields);
    return values.withTimestamps(definition, picked, new Date(), false, opts['silent'] === true);
  }
}
