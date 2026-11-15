import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { DeleteQueryBuilder } from '../delete-query-builder.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import type { JoinSourceBuilder } from '../join-source-builder.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type {
  AnyModel,
  DestroyOptions,
  ModelStatic,
  MutableOptions,
  RestoreOptions,
} from '../options.ts';
import type { RowMapper } from '../row-mapper.ts';
import type { QueryOptionsBase } from '../runtime.ts';
import type { UpdateQueryBuilder } from '../update-query-builder.ts';

/** Collaborators of {@link DestroyOperation}. */
export type DestroyOperationServices = Readonly<{
  /** Model state and scopes. */
  registry: ModelRegistry;
  /** Hooks. */
  lifecycle: InstanceLifecycle;
  /** Value rules. */
  values: ModelValues;
  /** SET items, paranoid filter. */
  columns: AttributeColumns;
  /** UPDATE builder (soft delete, restore). */
  updates: UpdateQueryBuilder;
  /** DELETE / TRUNCATE builder. */
  deletes: DeleteQueryBuilder;
  /** `using` relations. */
  joins: JoinSourceBuilder;
  /** Instances of returned rows. */
  rows: RowMapper;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/**
 * `Model.destroy` (DELETE, or soft delete of paranoid models), `Model.restore` and
 * `Model.truncate`, with bulk and individual hooks.
 */
export class DestroyOperation {
  readonly #registry: ModelRegistry;
  readonly #lifecycle: InstanceLifecycle;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #updates: UpdateQueryBuilder;
  readonly #deletes: DeleteQueryBuilder;
  readonly #joins: JoinSourceBuilder;
  readonly #rows: RowMapper;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: DestroyOperationServices) {
    this.#registry = services.registry;
    this.#lifecycle = services.lifecycle;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#updates = services.updates;
    this.#deletes = services.deletes;
    this.#joins = services.joins;
    this.#rows = services.rows;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.destroy`.
   *
   * @param model - Model class.
   * @param options - Destroy options.
   * @returns Number of deleted rows, or deleted instances with `returning: true`.
   */
  async destroy<M extends AnyModel>(
    model: ModelStatic<M>,
    options: DestroyOptions,
  ): Promise<number | M[]> {
    const { definition, runtime } = this.#registry.state(model);
    const opts: MutableOptions = {
      hooks: true,
      individualHooks: false,
      force: false,
      ...this.#registry.scoped(model, options),
    };
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeBulkDestroy', opts);
    }
    const soft = definition.deletedAt !== undefined && opts['force'] !== true;
    const where = soft ? this.#columns.paranoid(definition, opts['where'], true) : opts['where'];
    const individual = opts['individualHooks'] === true;
    const targets = individual
      ? await model.findAll({
          where: where as never,
          ...this.#values.queryOptions(options),
          paranoid: false,
        })
      : [];
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => this.#lifecycle.runHooks(model, 'beforeDestroy', instance, opts)),
      Promise.resolve(),
    );
    const deleted = await (async (): Promise<number | M[]> => {
      if (options.truncate === true) {
        await model.truncate(options);
        return 0;
      }
      const inAsAny =
        runtime.inAsAnyThreshold === undefined
          ? {}
          : { inAsAnyThreshold: runtime.inAsAnyThreshold };
      const node =
        soft && definition.deletedAt !== undefined
          ? this.#updates.build(
              definition,
              this.#columns.setItems(definition, { [definition.deletedAt]: new Date() }),
              where,
              {
                ...(options.returning === true ? { returning: true } : {}),
                ...inAsAny,
              },
            )
          : this.#deletes.build(definition, where, {
              ...(options.using === undefined ? {} : { using: this.#joins.build(options.using) }),
              ...(options.returning === true ? { returning: true } : {}),
              ...(options.limit === undefined ? {} : { limit: options.limit }),
              ...inAsAny,
            });
      const result = await runtime.execute(this.#compiler.compile(node), options);
      return options.returning === true
        ? result.rows.map((row) => this.#rows.instance(model, row))
        : result.rowCount;
    })();
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => this.#lifecycle.runHooks(model, 'afterDestroy', instance, opts)),
      Promise.resolve(),
    );
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterBulkDestroy', opts);
    }
    return deleted;
  }

  /**
   * `Model.restore`: sets `deletedAt = NULL` on matching rows of a paranoid model.
   *
   * @param model - Model class.
   * @param options - Rows to restore and hook options.
   * @returns Resolves when done.
   * @throws Error when the model is not paranoid.
   */
  async restore(model: ModelStatic<AnyModel>, options: RestoreOptions): Promise<void> {
    const { definition, runtime } = this.#registry.state(model);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const opts: MutableOptions = { hooks: true, individualHooks: false, ...options };
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'beforeBulkRestore', opts);
    }
    const individual = opts['individualHooks'] === true;
    const targets = individual
      ? await model.findAll({
          where: opts['where'] as never,
          ...this.#values.queryOptions(options),
          paranoid: false,
        })
      : [];
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => this.#lifecycle.runHooks(model, 'beforeRestore', instance, opts)),
      Promise.resolve(),
    );
    const node = this.#updates.build(
      definition,
      this.#columns.setItems(definition, { [definition.deletedAt]: null }),
      opts['where'],
      runtime.inAsAnyThreshold === undefined ? {} : { inAsAnyThreshold: runtime.inAsAnyThreshold },
    );
    await runtime.execute(this.#compiler.compile(node), options);
    await targets.reduce<Promise<unknown>>(
      (previous, instance) =>
        previous.then(() => this.#lifecycle.runHooks(model, 'afterRestore', instance, opts)),
      Promise.resolve(),
    );
    if (opts['hooks'] === true) {
      await this.#lifecycle.runHooks(model, 'afterBulkRestore', opts);
    }
  }

  /**
   * `Model.truncate`.
   *
   * @param model - Model class.
   * @param options - `cascade`, `restartIdentity` and query options.
   * @returns Resolves when done.
   */
  async truncate(
    model: object,
    options: QueryOptionsBase & Readonly<{ cascade?: boolean; restartIdentity?: boolean }>,
  ): Promise<void> {
    const { definition, runtime } = this.#registry.state(model);
    await runtime.execute(
      this.#compiler.compile(this.#deletes.truncate(definition, options)),
      options,
    );
  }
}
