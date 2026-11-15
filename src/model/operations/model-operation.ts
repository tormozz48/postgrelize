import type { HookType } from '../../hooks/hooks.ts';
import type { InstanceLifecycle } from '../instance-lifecycle.ts';
import type { MutableOptions } from '../options.ts';

/** Services every operation has: the hook runner. */
export type OperationServices = Readonly<{
  /** Hooks. */
  lifecycle: InstanceLifecycle;
}>;

// oxlint-disable-next-line typescript/no-explicit-any -- decorated methods take further arguments of any type.
type OperationMethod = (model: any, options: MutableOptions, ...rest: any[]) => Promise<unknown>;

/**
 * Base of `Model` operations: holds the injected services and provides the hook decorators.
 *
 * @typeParam S - Services of the operation.
 * @internal
 */
export abstract class ModelOperation<S extends OperationServices> {
  /** Injected collaborators. */
  protected readonly services: S;

  /**
   * @param services - Collaborators.
   */
  constructor(services: S) {
    this.services = services;
  }

  /**
   * Method decorator: runs `before` / `after` hooks with the options around a
   * `(model, options, ...rest)` method when `options.hooks === true`.
   *
   * @param before - Hook run before the method.
   * @param after - Hook run after the method resolved.
   * @returns The decorator.
   */
  static bulkHooks(
    before: HookType,
    after: HookType,
  ): <T extends OperationMethod>(
    method: T,
    context: ClassMethodDecoratorContext<ModelOperation<OperationServices>>,
  ) => T {
    return <T extends OperationMethod>(method: T): T =>
      async function (this: ModelOperation<OperationServices>, model, options, ...rest) {
        const run = (type: HookType): Promise<void> =>
          options['hooks'] === true
            ? this.services.lifecycle.runHooks(model, type, options)
            : Promise.resolve();
        await run(before);
        const result: unknown = await method.call(this, model, options, ...rest);
        await run(after);
        return result;
      } as T;
  }
}
