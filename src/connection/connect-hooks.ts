import type { Client as PgClient, PoolConfig } from 'pg';
import type { HookRegistry } from '../hooks/hooks.ts';
import { AfterConnectHook, hookFailures } from './after-connect-hook.ts';
import type { Connection, GetConnectionOptions } from './connection-types.ts';
import type { ConnectionConfig as ConnectionSettings } from './options.ts';

/**
 * Runs the connection hooks of a `Sequelize` instance: `beforeConnect` (may replace the password)
 * and `afterConnect` (session setup on each new pooled connection).
 *
 * @internal
 */
export class ConnectHooks {
  readonly #hooks: () => HookRegistry;
  readonly #owner: Readonly<{ config: ConnectionSettings }>;
  readonly #after = new AfterConnectHook((client) => this.#afterConnect(client));

  /**
   * @param hooks - Current hook registry of the instance.
   * @param owner - The `Sequelize` instance (hook context and connection settings).
   */
  constructor(hooks: () => HookRegistry, owner: Readonly<{ config: ConnectionSettings }>) {
    this.#hooks = hooks;
    this.#owner = owner;
  }

  /**
   * Adds the hook handling to a pool configuration.
   *
   * @param config - Pool configuration.
   * @returns Configuration whose password is resolved through `beforeConnect` and whose clients run `afterConnect`.
   */
  apply(config: PoolConfig): PoolConfig {
    return {
      ...config,
      password: () => this.#password(config.password),
      Client: this.#after.clientClass(),
    };
  }

  /**
   * Runs `beforePoolAcquire(options)` and `afterPoolAcquire(connection, options)` around an
   * acquisition, like Sequelize v6; a connection whose `afterPoolAcquire` throws is released.
   *
   * @param options - Options of `getConnection`.
   * @param acquire - Takes a connection from the pool.
   * @returns The acquired connection.
   */
  around(options: GetConnectionOptions, acquire: () => Promise<Connection>): Promise<Connection> {
    const hooks = this.#hooks();
    // no extra promise on the query path without these hooks
    return hooks.has('beforePoolAcquire') || hooks.has('afterPoolAcquire')
      ? this.#acquireWithHooks(options, acquire)
      : acquire();
  }

  async #acquireWithHooks(
    options: GetConnectionOptions,
    acquire: () => Promise<Connection>,
  ): Promise<Connection> {
    await this.#run('beforePoolAcquire', options);
    const connection = await acquire();
    try {
      await this.#run('afterPoolAcquire', connection, options);
    } catch (error) {
      connection.release();
      throw error;
    }
    return connection;
  }

  // marked like `afterConnect` failures, so they are not mapped to connection errors
  async #run(
    type: 'beforePoolAcquire' | 'afterPoolAcquire',
    ...args: readonly unknown[]
  ): Promise<void> {
    try {
      await this.#hooks().run(type, this.#owner, ...args);
    } catch (error) {
      if (typeof error === 'object' && error !== null) {
        hookFailures.add(error);
      }
      throw error;
    }
  }

  async #password(configured: PoolConfig['password']): Promise<string> {
    const password = typeof configured === 'function' ? await configured() : (configured ?? '');
    if (!this.#hooks().has('beforeConnect')) {
      return password;
    }
    const config = { ...this.#owner.config, password };
    await this.#hooks().run('beforeConnect', this.#owner, config);
    return config.password ?? '';
  }

  async #afterConnect(client: PgClient): Promise<void> {
    if (this.#hooks().has('afterConnect')) {
      await this.#hooks().run('afterConnect', this.#owner, client, { ...this.#owner.config });
    }
  }
}
