import type { Client as PgClient, PoolConfig } from 'pg';
import type { HookRegistry } from '../hooks/hooks.ts';
import { AfterConnectHook } from './after-connect-hook.ts';
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
