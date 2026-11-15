import type { HookFunction } from '../hooks/hooks.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

const missingHook = (): never => {
  throw new Error('addHook: hook function is required');
};

/**
 * Hook methods of `Sequelize`: `addHook`, `removeHook`, `hasHook`, `hasHooks`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeHooks = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class HooksCapability extends Base {
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
  };
