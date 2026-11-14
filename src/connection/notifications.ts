import type { Client as PgClient } from 'pg';
import { quoteIdent } from '../sql/compile.ts';

/** Handler of `LISTEN` notifications. */
export type NotificationHandler = (payload: string | undefined, channel: string) => unknown;

/** Dedicated LISTEN connection shared by all subscriptions of a Sequelize instance. */
export type Notifier = Readonly<{
  listen: (channel: string, handler: NotificationHandler) => Promise<() => Promise<void>>;
  close: () => Promise<void>;
}>;

type State = {
  client: Promise<PgClient> | undefined;
  handlers: Map<string, Set<NotificationHandler>>;
  closed: boolean;
};

const RECONNECT_DELAY_MS = 1000;

/** Creates a notifier that lazily opens one client and re-subscribes after connection loss. */
export const createNotifier = (connect: () => Promise<PgClient>): Notifier => {
  const state: State = { client: undefined, handlers: new Map(), closed: false };

  const dispatch = (message: Readonly<{ channel: string; payload?: string }>): void => {
    state.handlers.get(message.channel)?.forEach((handler) => {
      void Promise.resolve()
        .then(() => handler(message.payload, message.channel))
        .catch(() => undefined);
    });
  };

  const open = (): Promise<PgClient> => {
    state.client ??= connect().then(async (client) => {
      client.on('notification', dispatch);
      client.on('error', () => undefined);
      client.on('end', () => {
        state.client = undefined;
        if (!state.closed && state.handlers.size > 0) {
          setTimeout(() => void resubscribe(), RECONNECT_DELAY_MS);
        }
      });
      await [...state.handlers.keys()].reduce<Promise<unknown>>(
        (previous, channel) => previous.then(() => client.query(`LISTEN ${quoteIdent(channel)}`)),
        Promise.resolve(),
      );
      return client;
    });
    return state.client;
  };

  const resubscribe = async (): Promise<void> => {
    if (!state.closed) {
      await open().catch(() => {
        setTimeout(() => void resubscribe(), RECONNECT_DELAY_MS);
      });
    }
  };

  const listen = async (
    channel: string,
    handler: NotificationHandler,
  ): Promise<() => Promise<void>> => {
    const existing = state.handlers.get(channel);
    if (existing === undefined) {
      state.handlers.set(channel, new Set([handler]));
      const client = await open();
      await client.query(`LISTEN ${quoteIdent(channel)}`);
    } else {
      existing.add(handler);
      await open();
    }
    return async () => {
      const handlers = state.handlers.get(channel);
      handlers?.delete(handler);
      if (handlers !== undefined && handlers.size === 0) {
        state.handlers.delete(channel);
        const client = await state.client;
        await client?.query(`UNLISTEN ${quoteIdent(channel)}`);
      }
    };
  };

  const close = async (): Promise<void> => {
    state.closed = true;
    state.handlers.clear();
    const client = await state.client?.catch(() => undefined);
    state.client = undefined;
    await client?.end();
  };

  return { listen, close };
};
