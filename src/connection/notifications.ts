import type { Client as PgClient } from 'pg';
import { SqlCompiler } from '../sql/compile.ts';

/** Handler of `LISTEN` notifications. */
export type NotificationHandler = (payload: string | undefined, channel: string) => unknown;

const RECONNECT_DELAY_MS = 1000;

/**
 * Dedicated LISTEN connection shared by all subscriptions of a Sequelize instance: opened lazily and
 * re-subscribed after connection loss.
 */
export class NotificationListener {
  readonly #connect: () => Promise<PgClient>;
  readonly #handlers = new Map<string, Set<NotificationHandler>>();
  #client: Promise<PgClient> | undefined;
  #closed = false;

  /**
   * @param connect - Opens a dedicated client.
   */
  constructor(connect: () => Promise<PgClient>) {
    this.#connect = connect;
  }

  /**
   * Subscribes `handler` to a channel.
   *
   * @param channel - Channel name.
   * @param handler - Called with the payload and the channel.
   * @returns Function that unsubscribes the handler.
   */
  async listen(channel: string, handler: NotificationHandler): Promise<() => Promise<void>> {
    const existing = this.#handlers.get(channel);
    if (existing === undefined) {
      this.#handlers.set(channel, new Set([handler]));
      const client = await this.#open();
      await client.query(`LISTEN ${SqlCompiler.quoteIdent(channel)}`);
    } else {
      existing.add(handler);
      await this.#open();
    }
    return async () => {
      const handlers = this.#handlers.get(channel);
      handlers?.delete(handler);
      if (handlers !== undefined && handlers.size === 0) {
        this.#handlers.delete(channel);
        const client = await this.#client;
        await client?.query(`UNLISTEN ${SqlCompiler.quoteIdent(channel)}`);
      }
    };
  }

  /**
   * Removes all subscriptions and closes the connection.
   *
   * @returns Resolves when closed.
   */
  async close(): Promise<void> {
    this.#closed = true;
    this.#handlers.clear();
    const client = await this.#client?.catch(() => undefined);
    this.#client = undefined;
    await client?.end();
  }

  #dispatch(message: Readonly<{ channel: string; payload?: string }>): void {
    this.#handlers.get(message.channel)?.forEach((handler) => {
      void Promise.resolve()
        .then(() => handler(message.payload, message.channel))
        .catch(() => undefined);
    });
  }

  #open(): Promise<PgClient> {
    this.#client ??= this.#connect().then(async (client) => {
      client.on('notification', (message) => this.#dispatch(message));
      client.on('error', () => undefined);
      client.on('end', () => {
        this.#client = undefined;
        if (!this.#closed && this.#handlers.size > 0) {
          setTimeout(() => void this.#resubscribe(), RECONNECT_DELAY_MS);
        }
      });
      await [...this.#handlers.keys()].reduce<Promise<unknown>>(
        (previous, channel) =>
          previous.then(() => client.query(`LISTEN ${SqlCompiler.quoteIdent(channel)}`)),
        Promise.resolve(),
      );
      return client;
    });
    return this.#client;
  }

  async #resubscribe(): Promise<void> {
    if (!this.#closed) {
      await this.#open().catch(() => {
        setTimeout(() => void this.#resubscribe(), RECONNECT_DELAY_MS);
      });
    }
  }
}
