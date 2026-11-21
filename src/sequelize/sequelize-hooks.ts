import type { HookFunction, HookType } from '../hooks/hooks.ts';
import type { InstanceHookAdders } from './instance-hook-adders.ts';
import { NAMED_HOOKS } from '../model/mixins/named-hooks.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

const missingHook = (): never => {
  throw new Error('addHook: hook function is required');
};

/** Hook types that get a named adder on `Sequelize` instances (`sequelize.beforeCreate(fn)`): the run hooks that apply to an instance. */
const INSTANCE_HOOKS = [
  ...NAMED_HOOKS,
  'beforeConnect',
  'afterConnect',
  'beforeBulkSync',
  'afterBulkSync',
] as const satisfies readonly (HookType & keyof InstanceHookAdders)[];

/**
 * Hook methods of `Sequelize`: `addHook`, `removeHook`, `hasHook`, `hasHooks`, `runHooks` and the named adders.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeHooks = <TBase extends SequelizeConstructor>(Base: TBase) => {
  const Mixin = class HooksCapability extends Base {
    /**
     * Registers a global hook that runs for every model of this instance, or a connection hook such as `beforeConnect`. Global hooks are not fired for models that never use the hook type.
     *
     * @param type - Hook type, e.g. `'beforeCreate'`.
     * @param nameOrFn - Hook name (to remove it later) or the hook function.
     * @param hook - Hook function when a name is given.
     * @returns This instance.
     *
     * @example
     * ```ts
     * sequelize.addHook('beforeCreate', 'stamp', (instance: any) => {
     *   instance.createdBy = 'system';
     * });
     * ```
     */
    addHook(type: string, nameOrFn: string | HookFunction, hook?: HookFunction): this {
      const { internals } = this;
      internals.hooks =
        typeof nameOrFn === 'string'
          ? internals.hooks.add(type, hook ?? missingHook(), nameOrFn)
          : internals.hooks.add(type, nameOrFn);
      return this;
    }

    /**
     * Unregisters global hooks by name or by function reference.
     *
     * @param type - Hook type.
     * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
     * @returns This instance.
     *
     * @example
     * ```ts
     * sequelize.removeHook('beforeCreate', 'stamp');
     * ```
     */
    removeHook(type: string, nameOrFn?: string | HookFunction): this {
      this.internals.hooks = this.internals.hooks.remove(type, nameOrFn);
      return this;
    }

    /**
     * Tells whether this instance has at least one global hook of the given type.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists.
     *
     * @example
     * ```ts
     * if (!sequelize.hasHook('beforeCreate')) {
     *   sequelize.addHook('beforeCreate', () => {});
     * }
     * ```
     */
    hasHook(type: string): boolean {
      return this.internals.hooks.has(type);
    }

    /**
     * Alias of {@link Sequelize.hasHook}, kept for Sequelize v6 compatibility.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists.
     *
     * @example
     * ```ts
     * const registered = sequelize.hasHooks('afterUpdate');
     * ```
     */
    hasHooks(type: string): boolean {
      return this.hasHook(type);
    }

    /**
     * Runs the global hooks of a type with the given arguments.
     *
     * @param type - Hook type.
     * @param args - Hook arguments.
     * @returns Resolves when all hooks finished.
     *
     * @example
     * ```ts
     * await sequelize.runHooks('beforeConnect', { host: 'localhost' });
     * ```
     */
    runHooks(type: string, ...args: readonly unknown[]): Promise<void> {
      return this.internals.hooks.run(type as HookType, this, ...args);
    }
  };
  INSTANCE_HOOKS.forEach((type) => {
    Object.defineProperty(Mixin.prototype, type, {
      configurable: true,
      writable: true,
      value(
        this: InstanceType<typeof Mixin>,
        nameOrFn: string | HookFunction,
        fn?: HookFunction,
      ): void {
        this.addHook(type, nameOrFn, fn);
      },
    });
  });
  return Mixin;
};
