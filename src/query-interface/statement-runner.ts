import type { QueryResult } from '../connection/connection-manager.ts';
import { runtimeKey, type QueryOptionsBase, type RuntimeOwner } from '../model/runtime.ts';
import type { CompiledQuery } from '../sql/compile.ts';

/** Result rows of a statement. */
export type StatementRows = readonly Readonly<Record<string, unknown>>[];

/**
 * Runs schema statements through the runtime of a `Sequelize` instance, one after another.
 *
 * @internal
 */
export class StatementRunner {
  readonly #owner: RuntimeOwner;

  /**
   * @param owner - Owning `Sequelize` instance.
   */
  constructor(owner: RuntimeOwner) {
    this.#owner = owner;
  }

  /**
   * Runs a compiled query.
   *
   * @param query - Compiled query.
   * @param options - Query options.
   * @returns Query result.
   */
  async execute(query: CompiledQuery, options: QueryOptionsBase): Promise<QueryResult> {
    return await this.#owner[runtimeKey].execute(query, options);
  }

  /**
   * Runs one statement without parameters.
   *
   * @param sql - SQL statement.
   * @param options - Query options.
   * @returns Result rows.
   */
  async run(sql: string, options: QueryOptionsBase = {}): Promise<StatementRows> {
    const result = await this.execute({ text: sql, values: [] }, options);
    return result.rows;
  }

  /**
   * Runs statements in order, each after the previous one finished.
   *
   * @param statements - SQL statements.
   * @param options - Query options.
   */
  async runAll(statements: readonly string[], options: QueryOptionsBase = {}): Promise<void> {
    await statements.reduce<Promise<unknown>>(
      (previous, sql) => previous.then(() => this.run(sql, options)),
      Promise.resolve(),
    );
  }
}
