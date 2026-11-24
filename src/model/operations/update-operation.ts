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

// Targets of an `individualHooks` update and the rows saved one by one (when the hooks diverged).
type EachResult = Readonly<{ saved: UpdateRows | undefined; targets: readonly AnyModel[] }>;

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
    given: Values,
    options: UpdateOptions,
  ): Promise<UpdateResult<M>> {
    // like v6, values outside an explicit `fields` list are dropped before anything else
    const values = UpdateOperation.#listed(given, options.fields);
    const opts: MutableOptions = {
      validate: true,
      hooks: true,
      individualHooks: false,
      ...this.services.registry.scoped(model, options),
    };
    this.#expose(model, values, opts);
    if (opts['where'] === undefined || opts['where'] === null) {
      throw new AssertionError({ message: 'Missing where attribute in the options parameter' });
    }
    await this.#validated(model, values, opts);
    return (await this.#bulkUpdate(model, opts, options)) as UpdateResult<M>;
  }

  // Like v6, `beforeBulkUpdate` hooks see `fields` (the attributes being updated, plus `updatedAt`)
  // and `attributes` (the values, with the new `updatedAt`); both are read back after the hooks.
  #expose(model: ModelStatic<AnyModel>, values: Values, opts: MutableOptions): void {
    const { definition } = this.services.registry.state(model);
    const { updatedAt } = definition;
    const stamped = updatedAt !== undefined && opts['silent'] !== true;
    opts['attributes'] = stamped ? { ...values, [updatedAt]: new Date() } : { ...values };
    if (opts['fields'] === undefined) {
      const columns = Object.keys(values).filter(
        (name) => definition.attributes.get(name)?.type.isVirtual !== true,
      );
      opts['fields'] = updatedAt === undefined ? columns : [...new Set([...columns, updatedAt])];
    }
  }

  static #listed(values: Values, fields: readonly string[] | undefined): Values {
    return fields === undefined
      ? values
      : Object.fromEntries(Object.entries(values).filter(([name]) => fields.includes(name)));
  }

  async #validated(
    model: ModelStatic<AnyModel>,
    values: Values,
    opts: MutableOptions,
  ): Promise<void> {
    if (opts['validate'] === true) {
      const built = await this.#validate(model, values, opts);
      if (opts['sideEffects'] !== false) {
        UpdateOperation.#sideEffects(model, built, values, opts);
      }
    }
  }

  async #validate(
    model: ModelStatic<AnyModel>,
    values: Values,
    opts: MutableOptions,
  ): Promise<AnyModel> {
    const { definition } = this.services.registry.state(model);
    await new model(values, { isNewRecord: false }).validate({
      hooks: opts['hooks'] === true,
      skip: [...definition.attributes.keys()].filter((name) => !(name in values)),
    });
    // a new-record build tracks every value the setters wrote as changed
    return new model(values);
  }

  // Attributes that setters of the given attributes changed (a VIRTUAL attribute with a setter) are
  // updated too, like v6's `sideEffects: true`.
  static #sideEffects(
    model: ModelStatic<AnyModel>,
    built: AnyModel,
    values: Values,
    opts: MutableOptions,
  ): void {
    // defaults of a new build are not changes the caller asked for
    const defaults = new model({}).changed();
    const names = (built.changed() || []).filter(
      (name) => name in values || !(defaults || []).includes(name),
    );
    const extra = Object.fromEntries(names.map((name) => [name, built.get(name)]));
    opts['attributes'] = { ...(opts['attributes'] as Values), ...extra };
    const attributes = Object.keys(opts['attributes'] as Values);
    opts['fields'] = [...new Set([...(opts['fields'] as readonly string[]), ...attributes])];
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
    const each = call.individual ? await this.#beforeEach(call) : undefined;
    const executed = each?.saved ?? (await this.#execute(call));
    const updated = each === undefined ? executed : await this.#afterEach(call, each, executed);
    // like v6, `individualHooks` returns the instances even without `returning`
    return options.returning === true || call.individual
      ? [updated.count, updated.rows]
      : [updated.count];
  }

  // v6: the hooks get the instances that `beforeUpdate` saw (still marked changed) unless the rows
  // came back from `returning` or were saved one by one; without `returning` the caller gets those
  // very instances back.
  async #afterEach(call: UpdateCall, each: EachResult, updated: UpdateRows): Promise<UpdateRows> {
    const hookedTargets = each.saved === undefined && call.options.returning !== true;
    const hooked = hookedTargets ? each.targets : updated.rows;
    await this.services.lifecycle.runEach(call.model, 'afterUpdate', hooked, call.opts);
    return hookedTargets ? { count: updated.count, rows: [...each.targets] } : updated;
  }

  // Runs `beforeUpdate` on every target. Changes the hooks made become part of the UPDATE when every
  // row ends up with the same changes; otherwise the rows are saved one by one (v6).
  async #beforeEach(call: UpdateCall): Promise<EachResult> {
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
      return { saved: await UpdateOperation.#saveEach(targets, queryOptions), targets };
    }
    UpdateOperation.#adopt(call, changes[0] ?? {});
    return { saved: undefined, targets };
  }

  static async #saveEach(targets: readonly AnyModel[], queryOptions: object): Promise<UpdateRows> {
    const save = (instance: AnyModel) =>
      instance.save({ ...queryOptions, hooks: false, validate: false });
    const rows = await Promise.all(targets.map(save));
    return { count: rows.length, rows };
  }

  // The changes made by the hooks, shared by every row, replace the values of the UPDATE.
  static #adopt({ opts }: UpdateCall, common: Values): void {
    opts['attributes'] = { ...common };
    opts['fields'] = [
      ...new Set([...(opts['fields'] as readonly string[]), ...Object.keys(common)]),
    ];
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

  #changes({ state: { definition }, opts }: UpdateCall): Values {
    const { values } = this.services;
    const fields = opts['fields'] as readonly string[];
    const picked = values.pick(opts['attributes'] as Values, fields);
    const stored = Object.fromEntries(
      Object.entries(picked).filter(([name, value]) => {
        const attribute = definition.attributes.get(name);
        return value !== undefined && attribute?.type.isVirtual !== true;
      }),
    );
    return values.withTimestamps(definition, stored, new Date(), false, opts['silent'] === true);
  }
}
