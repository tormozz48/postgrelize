import type { SyncOptions } from '../query-interface/schema-synchronizer.ts';
import type { InstanceLifecycle } from './instance-lifecycle.ts';

/** Runs the `beforeSync` / `afterSync` hooks of a model around its table sync. */
export class SyncHooks {
  readonly #lifecycle: InstanceLifecycle;

  /**
   * @param lifecycle - Hook runner (model hooks, then Sequelize-level hooks).
   */
  constructor(lifecycle: InstanceLifecycle) {
    this.#lifecycle = lifecycle;
  }

  /**
   * Runs `run` between the model's sync hooks unless `options.hooks` is `false`.
   *
   * @param model - Model class.
   * @param options - Sync options passed to the hooks.
   * @param run - The table sync.
   */
  async around(model: object, options: SyncOptions, run: () => Promise<void>): Promise<void> {
    if (options.hooks === false) {
      await run();
      return;
    }
    const hookOptions = { ...options, hooks: true };
    await this.#lifecycle.runHooks(model, 'beforeSync', hookOptions);
    await run();
    await this.#lifecycle.runHooks(model, 'afterSync', hookOptions);
  }
}
