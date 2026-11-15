import { randomUUID } from 'node:crypto';
import type { IncludeNode } from '../../associations/include.ts';
import type { QueryResult } from '../../connection/connection-manager.ts';
import { type CompiledQuery, SqlCompiler } from '../../sql/compile.ts';
import type { Transaction } from '../../transaction/transaction.ts';
import type { AnyModel, FindOptions, ModelStatic } from '../options.ts';
import type { ModelRuntime } from '../runtime.ts';
import type { SelectOptions } from '../select-query-builder.ts';
import type { FindOperationServices } from './find-lookups.ts';
import { ModelOperation } from './model-operation.ts';

type CursorRun = (text: string, values?: readonly unknown[]) => Promise<QueryResult>;

// One open cursor of `Model.findEach`.
type CursorCall<M extends AnyModel> = Readonly<{
  model: ModelStatic<M>;
  includes: readonly IncludeNode[];
  batchSize: number;
  compiled: CompiledQuery;
  own: Transaction | undefined;
  transaction: Transaction;
  name: string;
  run: CursorRun;
}>;

/**
 * `Model.findEach`: streams rows with a server-side cursor.
 *
 * @internal
 */
export class FindCursor extends ModelOperation<FindOperationServices> {
  /**
   * Streams instances of matching rows in batches.
   *
   * @param model - Model class.
   * @param options - Find options.
   * @param cursor - `batchSize` (rows per FETCH, default 100).
   * @returns Async iterator of instances.
   * @throws Error for joined includes or an invalid batch size.
   */
  async *each<M extends AnyModel>(
    model: ModelStatic<M>,
    options: FindOptions,
    cursor: Readonly<{ batchSize?: number }>,
  ): AsyncGenerator<M, void, undefined> {
    const { runtime } = this.services.registry.state(model);
    const scoped = this.services.registry.scoped(model, options);
    const includes = this.services.includes.normalize(model, scoped.include);
    const batchSize = FindCursor.#batchSize(includes, cursor);
    const compiled = this.#compile(model, scoped);
    const { own, transaction } = await FindCursor.#begin(runtime, options);
    const name = SqlCompiler.quoteIdent(`pgz_cursor_${randomUUID().replaceAll('-', '')}`);
    const run: CursorRun = (text, values = []) =>
      runtime.execute(
        { text, values },
        { ...this.services.values.queryOptions(options), transaction },
      );
    yield* this.#iterate({ model, includes, batchSize, compiled, own, transaction, name, run });
  }

  static #batchSize(
    includes: readonly IncludeNode[],
    cursor: Readonly<{ batchSize?: number }>,
  ): number {
    if (includes.some((node) => !node.separate)) {
      throw new Error('findEach does not support joined includes');
    }
    const batchSize = cursor.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('findEach: batchSize must be a positive integer');
    }
    return batchSize;
  }

  #compile(model: ModelStatic<AnyModel>, scoped: FindOptions): CompiledQuery {
    const { definition, runtime } = this.services.registry.state(model);
    const { columns, compiler, selects } = this.services;
    const query = {
      ...scoped,
      where: columns.paranoid(definition, scoped.where, scoped.paranoid),
    };
    return compiler.compile(
      selects.build(definition, query as SelectOptions, runtime.inAsAnyThreshold),
    );
  }

  static async #begin(
    runtime: ModelRuntime,
    options: FindOptions,
  ): Promise<Readonly<{ own: Transaction | undefined; transaction: Transaction }>> {
    const own =
      options.transaction === undefined || options.transaction === null
        ? await runtime.beginTransaction()
        : undefined;
    return { own, transaction: own ?? (options.transaction as Transaction) };
  }

  async *#iterate<M extends AnyModel>(call: CursorCall<M>): AsyncGenerator<M, void, undefined> {
    let failed = false;
    try {
      yield* this.#fetch(call);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await FindCursor.#close(call, failed);
    }
  }

  async *#fetch<M extends AnyModel>(call: CursorCall<M>): AsyncGenerator<M, void, undefined> {
    const { model, includes, batchSize, compiled, transaction, name, run } = call;
    await run(`DECLARE ${name} NO SCROLL CURSOR FOR ${compiled.text}`, compiled.values);
    for (;;) {
      const batch = await run(`FETCH ${batchSize} FROM ${name}`);
      if (batch.rows.length === 0) {
        break;
      }
      const instances = batch.rows.map((row) => this.services.rows.instance(model, row));
      if (includes.length > 0) {
        await this.services.loader.loadSeparate(instances, includes, { transaction });
      }
      yield* instances;
    }
  }

  static async #close({ own, run, name }: CursorCall<AnyModel>, failed: boolean): Promise<void> {
    if (own === undefined) {
      await run(`CLOSE ${name}`).catch(() => undefined);
    } else if (failed) {
      await own.rollback().catch(() => undefined);
    } else {
      await own.commit();
    }
  }
}
