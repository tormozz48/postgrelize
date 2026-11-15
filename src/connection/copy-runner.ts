import type { PgErrorMapper } from '../errors/map-pg-error.ts';
import { CopyFromStdin } from './copy-from-stdin.ts';
import { CopyToStdout } from './copy-to-stdout.ts';
import type { Client, ExecuteOptions } from './connection-types.ts';
import type { QueryLogger } from './query-logger.ts';

type Submit<T> = Readonly<{ query: (submittable: T) => unknown }>;

/** Runs `COPY ... FROM STDIN` and `COPY ... TO STDOUT` on a writer connection. */
export class CopyRunner {
  readonly #acquire: () => Promise<Client>;
  readonly #logger: QueryLogger;
  readonly #errors: PgErrorMapper;

  /**
   * @param acquire - Acquires a writer connection.
   * @param logger - Logger of executed statements.
   * @param errors - Driver error mapper.
   */
  constructor(acquire: () => Promise<Client>, logger: QueryLogger, errors: PgErrorMapper) {
    this.#acquire = acquire;
    this.#logger = logger;
    this.#errors = errors;
  }

  /**
   * Streams `lines` into `COPY ... FROM STDIN`.
   *
   * @param text - `COPY ... FROM STDIN` statement.
   * @param lines - Encoded rows.
   * @param options - Client and logging settings.
   * @returns Copied row count.
   */
  async from(text: string, lines: AsyncIterable<string>, options: ExecuteOptions): Promise<number> {
    const client = options.client ?? (await this.#acquire());
    try {
      return await this.#copyIn(client, text, lines, options);
    } finally {
      if (options.client === undefined) {
        client.release();
      }
    }
  }

  /**
   * Runs `COPY ... TO STDOUT` and yields the output chunks.
   *
   * @param text - `COPY ... TO STDOUT` statement.
   * @param options - Client and logging settings.
   * @returns Async iterator of output chunks.
   */
  async *to(text: string, options: ExecuteOptions): AsyncGenerator<Buffer, void, undefined> {
    const client = options.client ?? (await this.#acquire());
    try {
      yield* this.#copyOut(client, text, options);
    } catch (error) {
      throw this.#errors.mapQueryError(error, { sql: text, parameters: [] });
    } finally {
      if (options.client === undefined) {
        client.release();
      }
    }
  }

  async #copyIn(
    client: Client,
    text: string,
    lines: AsyncIterable<string>,
    options: ExecuteOptions,
  ): Promise<number> {
    const started = performance.now();
    const copy = new CopyFromStdin(text, lines);
    const done = copy.done();
    try {
      void (client as unknown as Submit<CopyFromStdin>).query(copy);
      const rowCount = await done;
      this.#logger.log({ text, values: [] }, options, performance.now() - started);
      return rowCount;
    } catch (error) {
      throw this.#errors.mapQueryError(error, { sql: text, parameters: [] });
    } finally {
      await copy.settled();
    }
  }

  async *#copyOut(
    client: Client,
    text: string,
    options: ExecuteOptions,
  ): AsyncGenerator<Buffer, void, undefined> {
    const started = performance.now();
    const copy = new CopyToStdout(text);
    void (client as unknown as Submit<CopyToStdout>).query(copy);
    let completed = false;
    try {
      yield* copy.chunks();
      await copy.done();
      completed = true;
      this.#logger.log({ text, values: [] }, options, performance.now() - started);
    } finally {
      if (!completed) {
        await CopyRunner.#discard(copy);
      }
    }
  }

  static async #discard(copy: CopyToStdout): Promise<void> {
    copy.discard();
    await copy.done().catch(() => undefined);
  }
}
