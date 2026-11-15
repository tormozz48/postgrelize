import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import type { JoinSourceBuilder } from '../join-source-builder.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type { AnyModel, ModelStatic, MutableOptions, UpdateOptions, Values } from '../options.ts';
import type { ReturningOld } from '../returning-old.ts';
import type { UpdateQueryBuilder } from '../update-query-builder.ts';
import type { WrittenRows } from '../written-rows.ts';

/** Collaborators of {@link UpdateOperation}. */
export type UpdateOperationServices = Readonly<{
  /** Model state and scopes. */
  registry: ModelRegistry;
  /** Hooks. */
  lifecycle: InstanceLifecycle;
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

/** `Model.update`: bulk UPDATE with validation, bulk / individual hooks, `from` and `returning`. */
export class UpdateOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #updates: UpdateQueryBuilder;
  readonly #joins: JoinSourceBuilder;
  readonly #returningOld: ReturningOld;
  readonly #written: WrittenRows;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: UpdateOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#updates = services.updates;
    this.#joins = services.joins;
    this.#returningOld = services.returningOld;
    this.#written = services.written;
    this.#compiler = services.compiler;
  }

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
  ): Promise<[affectedCount: number, affectedRows?: M[]]> {
    const { definition, runtime } = this.#registry.state(model);
    const opts: MutableOptions = {
      validate: true,
      hooks: true,
      individualHooks: false,
      ...this.#registry.scoped(model, options),
      attributes: { ...values },
    };
    if (opts['validate'] === true) {
      const probe = new model(values, { isNewRecord: false });
      await probe.validate({
        hooks: opts['hooks'] === true,
        skip: [...definition.attributes.keys()].filter((name) => !(name in values)),
      });
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeBulkUpdate', opts);
    }
    const where = this.#columns.paranoid(
      definition,
      opts['where'],
      opts['paranoid'] as boolean | undefined,
    );
    const individual = opts['individualHooks'] === true;
    const targets = individual
      ? await model.findAll({
          where: where as never,
          ...this.#values.queryOptions(options),
          paranoid: false,
        })
      : [];
    const attributes = opts['attributes'] as Values;
    if (individual) {
      await targets.reduce<Promise<unknown>>(
        (previous, instance) =>
          previous.then(() => {
            instance.set(attributes);
            return this.#lifecycle.runHooks(model, 'beforeUpdate', instance, opts);
          }),
        Promise.resolve(),
      );
    }
    const changes = this.#values.withTimestamps(
      definition,
      this.#values.pick(attributes, options.fields as readonly string[] | undefined),
      new Date(),
      false,
      opts['silent'] === true,
    );
    if (individual && options.from !== undefined) {
      throw new Error('update: individualHooks cannot be combined with from');
    }
    if (options.returningOld === true && options.returning !== true) {
      throw new Error('update: returningOld requires returning: true');
    }
    const old = await this.#returningOld.enabled(runtime, options);
    const from = this.#joins.build(options.from);
    const node = this.#updates.build(
      definition,
      this.#columns.setItems(
        definition,
        changes,
        this.#columns.whereCompiler(definition, from.length === 0 ? undefined : definition.name),
      ),
      where,
      {
        ...(from.length === 0 ? {} : { from }),
        ...(options.returning === true || individual ? { returning: true } : {}),
        ...(runtime.inAsAnyThreshold === undefined
          ? {}
          : { inAsAnyThreshold: runtime.inAsAnyThreshold }),
      },
    );
    const result = await runtime.execute(
      this.#compiler.compile(old ? this.#returningOld.node(definition, node) : node),
      options,
    );
    const updated = result.rows.map((row) => this.#written.instance(model, row, old));
    if (individual) {
      await updated.reduce<Promise<unknown>>(
        (previous, instance) =>
          previous.then(() => this.#lifecycle.runHooks(model, 'afterUpdate', instance, opts)),
        Promise.resolve(),
      );
    }
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterBulkUpdate', opts);
    }
    return options.returning === true ? [result.rowCount, updated] : [result.rowCount];
  }
}
