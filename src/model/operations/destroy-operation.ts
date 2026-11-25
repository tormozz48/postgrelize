import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { DeleteQueryBuilder } from '../delete-query-builder.ts';
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
import { WhereCompiler } from '../../where/where.ts';
import { ModelOperation, type OperationServices } from './model-operation.ts';

/** Collaborators of {@link DestroyOperation}. */
export type DestroyOperationServices = OperationServices &
  Readonly<{
    /** Model state and scopes. */
    registry: ModelRegistry;
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

// One `Model.destroy` call after the bulk hook: the filter and whether rows are soft-deleted.
type DestroyCall = Readonly<{
  model: ModelStatic<AnyModel>;
  options: DestroyOptions;
  where: unknown;
  soft: boolean;
}>;

/**
 * `Model.destroy` (DELETE, or soft delete of paranoid models), `Model.restore` and
 * `Model.truncate`, with bulk and individual hooks.
 */
export class DestroyOperation extends ModelOperation<DestroyOperationServices> {
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
    const opts: MutableOptions = {
      hooks: true,
      individualHooks: false,
      force: false,
      ...this.services.registry.scoped(model, options),
    };
    DestroyOperation.#assertWhere(opts);
    return (await this.#bulkDestroy(model, opts, options)) as number | M[];
  }

  static #assertWhere(opts: MutableOptions): void {
    if (opts['truncate'] === true) {
      return;
    }
    if (!opts['where']) {
      throw new Error(
        'Missing where or truncate attribute in the options parameter of model.destroy.',
      );
    }
    if (!WhereCompiler.isConditions(opts['where'])) {
      throw new Error(
        'Expected plain object, array or sequelize method in the options.where parameter of model.destroy.',
      );
    }
  }

  @ModelOperation.bulkHooks('beforeBulkDestroy', 'afterBulkDestroy')
  async #bulkDestroy(
    model: ModelStatic<AnyModel>,
    opts: MutableOptions,
    options: DestroyOptions,
  ): Promise<number | AnyModel[]> {
    const { definition } = this.services.registry.state(model);
    const { columns, lifecycle } = this.services;
    const soft = definition.deletedAt !== undefined && opts['force'] !== true;
    const where = soft ? columns.paranoid(definition, opts['where'], true) : opts['where'];
    const targets = await this.#targets(model, opts, where, options);
    await lifecycle.runEach(model, 'beforeDestroy', targets, opts);
    const deleted = await this.#delete({ model, options, where, soft });
    await lifecycle.runEach(model, 'afterDestroy', targets, opts);
    return deleted;
  }

  async #targets(
    model: ModelStatic<AnyModel>,
    opts: MutableOptions,
    where: unknown,
    options: QueryOptionsBase,
  ): Promise<AnyModel[]> {
    return opts['individualHooks'] === true
      ? model.findAll({
          where: where as never,
          ...this.services.values.queryOptions(options),
          paranoid: false,
        })
      : [];
  }

  async #delete(call: DestroyCall): Promise<number | AnyModel[]> {
    const { model, options } = call;
    if (options.truncate === true && !call.soft) {
      await model.truncate(options);
      return 0;
    }
    const { runtime } = this.services.registry.state(model);
    const node = this.#statement(call);
    const result = await runtime.execute(this.services.compiler.compile(node), options);
    return options.returning === true
      ? result.rows.map((row) => this.services.rows.instance(model, row))
      : result.rowCount;
  }

  #statement({ model, options, where, soft }: DestroyCall) {
    const { definition, runtime } = this.services.registry.state(model);
    const { columns, deletes, joins, updates } = this.services;
    const inAsAny = DestroyOperation.#inAsAny(runtime.inAsAnyThreshold);
    const returning = options.returning === true ? { returning: true } : {};
    if (soft && definition.deletedAt !== undefined) {
      const set = columns.setItems(definition, { [definition.deletedAt]: new Date() });
      return updates.build(definition, set, where, { ...returning, ...inAsAny });
    }
    return deletes.build(definition, where, {
      ...(options.using === undefined ? {} : { using: joins.build(options.using) }),
      ...returning,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...inAsAny,
    });
  }

  static #inAsAny(threshold: number | undefined) {
    return threshold === undefined ? {} : { inAsAnyThreshold: threshold };
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
    const { definition } = this.services.registry.state(model);
    if (definition.deletedAt === undefined) {
      throw new Error('Model is not paranoid');
    }
    const opts: MutableOptions = { hooks: true, individualHooks: false, ...options };
    await this.#bulkRestore(model, opts, options, definition.deletedAt);
  }

  @ModelOperation.bulkHooks('beforeBulkRestore', 'afterBulkRestore')
  async #bulkRestore(
    model: ModelStatic<AnyModel>,
    opts: MutableOptions,
    options: RestoreOptions,
    deletedAt: string,
  ): Promise<void> {
    const { definition, runtime } = this.services.registry.state(model);
    const { columns, compiler, lifecycle, updates } = this.services;
    const targets = await this.#targets(model, opts, opts['where'], options);
    await lifecycle.runEach(model, 'beforeRestore', targets, opts);
    const set = columns.setItems(definition, { [deletedAt]: columns.notDeletedValue(definition) });
    const inAsAny = DestroyOperation.#inAsAny(runtime.inAsAnyThreshold);
    const node = updates.build(definition, set, opts['where'], inAsAny);
    await runtime.execute(compiler.compile(node), options);
    await lifecycle.runEach(model, 'afterRestore', targets, opts);
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
    const { definition, runtime } = this.services.registry.state(model);
    const { compiler, deletes } = this.services;
    await runtime.execute(compiler.compile(deletes.truncate(definition, options)), options);
  }
}
