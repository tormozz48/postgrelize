import type { SqlCompiler } from '../../sql/compile.ts';
import { MergeQueryBuilder, type MergeOptions } from '../merge-query-builder.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import type { ReturningOld } from '../returning-old.ts';
import type { QueryOptionsBase } from '../runtime.ts';
import type { WrittenRows } from '../written-rows.ts';

/** Action reported by `merge_action()`. */
export type MergeActionName = 'INSERT' | 'UPDATE' | 'DELETE';

/** Result of `Model.merge`. */
export type MergeResult<M> = Readonly<{
  /** Number of affected rows. */
  rowCount: number;
  /** Written rows (with `returning: true`). */
  rows: readonly Readonly<{
    /** Action taken. */ action: MergeActionName;
    /** Row after the action. */ instance: M;
  }>[];
}>;

/** Options of `Model.merge` with query and RETURNING options. */
export type MergeCallOptions = MergeOptions<unknown> &
  QueryOptionsBase &
  Readonly<{
    /** Return written rows (PostgreSQL 17+). */
    returning?: boolean;
    /** With `returning`: expose pre-statement values as `instance.oldValues` (PostgreSQL 18+). */
    returningOld?: boolean;
  }>;

/** Collaborators of {@link MergeOperation}. */
export type MergeOperationServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** MERGE builder. */
  merges: MergeQueryBuilder;
  /** `returningOld` support. */
  returningOld: ReturningOld;
  /** Instances of returned rows. */
  written: WrittenRows;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/** `Model.merge`: `MERGE INTO ... USING ...` with server version checks (PostgreSQL 15 / 17 / 18). */
export class MergeOperation {
  readonly #registry: ModelRegistry;
  readonly #merges: MergeQueryBuilder;
  readonly #returningOld: ReturningOld;
  readonly #written: WrittenRows;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: MergeOperationServices) {
    this.#registry = services.registry;
    this.#merges = services.merges;
    this.#returningOld = services.returningOld;
    this.#written = services.written;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.merge`.
   *
   * @param model - Model class.
   * @param options - Source, join condition, WHEN clauses, `returning`, `returningOld`.
   * @returns Affected row count and, with `returning`, `{ action, instance }` per row.
   * @throws Error when the server is too old for the requested features.
   */
  async merge<M extends AnyModel>(
    model: ModelStatic<M>,
    options: MergeCallOptions,
  ): Promise<MergeResult<M>> {
    const { definition, runtime } = this.#registry.state(model);
    const version = await runtime.serverVersion();
    if (version < 150000) {
      throw new Error('merge requires PostgreSQL 15 or newer');
    }
    if (
      (options.returning === true || options.whenNotMatchedBySource !== undefined) &&
      version < 170000
    ) {
      throw new Error(
        'merge with returning or whenNotMatchedBySource requires PostgreSQL 17 or newer',
      );
    }
    if (options.returningOld === true && options.returning !== true) {
      throw new Error('merge: returningOld requires returning: true');
    }
    const old = await this.#returningOld.enabled(runtime, options);
    const node = this.#merges.build(definition, options, options.returning === true);
    const result = await runtime.execute(
      this.#compiler.compile(old ? this.#returningOld.node(definition, node) : node),
      options,
    );
    return {
      rowCount: result.rowCount,
      rows: result.rows.map((row) => ({
        action: String(row[MergeQueryBuilder.ACTION]) as MergeActionName,
        instance: this.#written.instance(model, row, old),
      })),
    };
  }
}
