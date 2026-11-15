import type { NotificationHandler } from '../connection/notifications.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

/**
 * Notification methods of `Sequelize` (PostgreSQL extension): `listen` and `notify`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeNotifications = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class NotificationsCapability extends Base {
    /**
     * Subscribes to `NOTIFY` messages on a channel using one dedicated connection per instance (re-subscribed
     * after connection loss). PostgreSQL extension.
     *
     * @param channel - Channel name.
     * @param handler - Called with the payload and the channel.
     * @returns Function that unsubscribes the handler.
     */
    listen(channel: string, handler: NotificationHandler): Promise<() => Promise<void>> {
      return this.internals.listen(channel, handler);
    }

    /**
     * Sends a notification (`pg_notify`). PostgreSQL extension.
     *
     * @param channel - Channel name.
     * @param payload - Payload text (objects are sent as JSON).
     * @param options - Query options (inside a transaction the notification is sent on commit).
     * @returns Resolves when sent.
     */
    async notify(
      channel: string,
      payload?: unknown,
      options: QueryOptionsBase = {},
    ): Promise<void> {
      const text =
        payload === undefined
          ? ''
          : typeof payload === 'string'
            ? payload
            : JSON.stringify(payload);
      const query = { text: 'SELECT pg_notify($1, $2)', values: [channel, text] };
      await this.internals.execute(query, options);
    }
  };
