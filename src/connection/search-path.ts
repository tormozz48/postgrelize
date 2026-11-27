import type { Client } from './connection-types.ts';

// a transaction-local value would be lost between statements outside a transaction
const SET = 'SELECT set_config($1, $2, false)';

/**
 * Per-query `search_path` (Sequelize v6 `searchPath` with `dialectOptions.prependSearchPath`):
 * set on the connection for the statement and restored afterwards, so it never reaches the next
 * user of a pooled connection. The value is bound.
 */
export class SearchPath {
  /**
   * Runs `work` with `search_path` set to `path`.
   *
   * @param client - Connection the work runs on.
   * @param path - Comma separated schema list.
   * @param work - The query to run.
   * @returns The result of `work`.
   */
  async run<T>(client: Pick<Client, 'query'>, path: string, work: () => Promise<T>): Promise<T> {
    const previous = await client.query({
      text: "SELECT current_setting('search_path') AS value",
    });
    await SearchPath.#set(client, path);
    try {
      return await work();
    } finally {
      // fails in an aborted transaction, whose rollback restores the value
      const { value } = previous.rows[0] as { value: string };
      await SearchPath.#set(client, value).catch(() => undefined);
    }
  }

  static #set(client: Pick<Client, 'query'>, value: string): Promise<unknown> {
    return client.query({ text: SET, values: ['search_path', value] });
  }
}
