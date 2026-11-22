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
     * Subscribes a handler to `NOTIFY` messages on a channel over one dedicated connection per instance, which is
     * re-subscribed after connection loss. PostgreSQL extension.
     *
     * @postgrelize
     * @param channel - Channel name.
     * @param handler - Called with the payload and the channel.
     * @returns Function that unsubscribes the handler.
     *
     * @example
     * ```ts
     * const stop = await sequelize.listen('jobs', (payload, channel) => {
     *   console.log(channel, payload);
     * });
     * await sequelize.notify('jobs', { id: 1 });
     * await stop();
     * ```
     */
    listen(channel: string, handler: NotificationHandler): Promise<() => Promise<void>> {
      return this.internals.listen(channel, handler);
    }

    /**
     * Sends a notification to a channel with `pg_notify`. PostgreSQL extension.
     *
     * @postgrelize
     * @param channel - Channel name.
     * @param payload - Payload text (objects are sent as JSON).
     * @param options - Query options (inside a transaction the notification is sent on commit).
     * @returns Resolves when sent.
     * @see {@link Sequelize.listen}
     *
     * @example
     * ```ts
     * await sequelize.notify('jobs', 'refresh');
     * await sequelize.notify('jobs', { id: 42 }, { transaction });
     * ```
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
