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
     * Adds a hook run for every model (or `beforeConnect`).
     *
     * @param type - Hook type, e.g. `'beforeCreate'`.
     * @param nameOrFn - Hook name (to remove it later) or the hook function.
     * @param hook - Hook function when a name is given.
     * @returns This instance.
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
     * Removes hooks by name or function.
     *
     * @param type - Hook type.
     * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
     * @returns This instance.
     */
    removeHook(type: string, nameOrFn?: string | HookFunction): this {
      this.internals.hooks = this.internals.hooks.remove(type, nameOrFn);
      return this;
    }

    /**
     * Checks whether hooks of the type are registered.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists.
     */
    hasHook(type: string): boolean {
      return this.internals.hooks.has(type);
    }

    /**
     * Alias of {@link Sequelize.hasHook}.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists.
     */
    hasHooks(type: string): boolean {
      return this.hasHook(type);
    }
  };
