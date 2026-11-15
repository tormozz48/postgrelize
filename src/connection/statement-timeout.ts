import type { Client } from './connection-types.ts';

const SET = 'SELECT set_config($1, $2, true)';

/**
 * Per-query `statement_timeout`: applied with `set_config(..., true)`, so the value is transaction-local
 * and never reaches a pooled connection. The timeout value is a validated integer and is bound.
 */
export class StatementTimeout {
  /**
   * Runs `work` with `statement_timeout` set to `milliseconds`.
   *
   * Outside a transaction the work runs in its own `BEGIN … COMMIT` on the client. Inside one the previous
   * value is restored afterwards, so later statements of the transaction keep their timeout.
   *
   * @param client - Connection the work runs on.
   * @param inTransaction - Whether `client` already holds a transaction.
   * @param milliseconds - Timeout; `0` disables it.
   * @param work - The query to run.
   * @returns The result of `work`.
   * @throws Error when `milliseconds` is not a non-negative integer.
   */
  async run<T>(
    client: Pick<Client, 'query'>,
    inTransaction: boolean,
    milliseconds: number,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new Error(
        `statementTimeout must be a non-negative integer, got ${String(milliseconds)}`,
      );
    }
    return inTransaction
      ? this.#inTransaction(client, milliseconds, work)
      : this.#alone(client, milliseconds, work);
  }

  async #inTransaction<T>(
    client: Pick<Client, 'query'>,
    milliseconds: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = await client.query({
      text: "SELECT current_setting('statement_timeout') AS value",
    });
    await StatementTimeout.#set(client, String(milliseconds));
    try {
      return await work();
    } finally {
      const value = (previous.rows[0] as { value: string } | undefined)?.value ?? '0';
      await StatementTimeout.#set(client, value).catch(() => undefined);
    }
  }

  async #alone<T>(
    client: Pick<Client, 'query'>,
    milliseconds: number,
    work: () => Promise<T>,
  ): Promise<T> {
    await client.query({ text: 'BEGIN' });
    try {
      await StatementTimeout.#set(client, String(milliseconds));
      const result = await work();
      await client.query({ text: 'COMMIT' });
      return result;
    } catch (error) {
      await client.query({ text: 'ROLLBACK' }).catch(() => undefined);
      throw error;
    }
  }

  static #set(client: Pick<Client, 'query'>, value: string): Promise<unknown> {
    return client.query({ text: SET, values: ['statement_timeout', value] });
  }
}
