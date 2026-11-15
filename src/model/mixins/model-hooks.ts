import type { HookFunction, HookType } from '../../hooks/hooks.ts';
import type { Model } from '../model.ts';
import { lifecycle, registry } from '../model-services.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import { NAMED_HOOKS, type NamedHookAdder } from './named-hooks.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Hook statics of `Model`: `addHook`, `removeHook`, `hasHook(s)`, `runHooks` and the named adders (`Model.beforeCreate(fn)`, ...).
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelHooks = <TBase extends ModelConstructor>(Base: TBase) => {
  const Mixin = class HooksCapability extends Base {
    /** Adds a `beforeValidate` hook: `Model.beforeValidate(fn)` or `Model.beforeValidate(name, fn)`. */
    declare static beforeValidate: NamedHookAdder;

    /** Adds a `afterValidate` hook: `Model.afterValidate(fn)` or `Model.afterValidate(name, fn)`. */
    declare static afterValidate: NamedHookAdder;

    /** Adds a `validationFailed` hook: `Model.validationFailed(fn)` or `Model.validationFailed(name, fn)`. */
    declare static validationFailed: NamedHookAdder;

    /** Adds a `beforeCreate` hook: `Model.beforeCreate(fn)` or `Model.beforeCreate(name, fn)`. */
    declare static beforeCreate: NamedHookAdder;

    /** Adds a `afterCreate` hook: `Model.afterCreate(fn)` or `Model.afterCreate(name, fn)`. */
    declare static afterCreate: NamedHookAdder;

    /** Adds a `beforeUpdate` hook: `Model.beforeUpdate(fn)` or `Model.beforeUpdate(name, fn)`. */
    declare static beforeUpdate: NamedHookAdder;

    /** Adds a `afterUpdate` hook: `Model.afterUpdate(fn)` or `Model.afterUpdate(name, fn)`. */
    declare static afterUpdate: NamedHookAdder;

    /** Adds a `beforeSave` hook: `Model.beforeSave(fn)` or `Model.beforeSave(name, fn)`. */
    declare static beforeSave: NamedHookAdder;

    /** Adds a `afterSave` hook: `Model.afterSave(fn)` or `Model.afterSave(name, fn)`. */
    declare static afterSave: NamedHookAdder;

    /** Adds a `beforeDestroy` hook: `Model.beforeDestroy(fn)` or `Model.beforeDestroy(name, fn)`. */
    declare static beforeDestroy: NamedHookAdder;

    /** Adds a `afterDestroy` hook: `Model.afterDestroy(fn)` or `Model.afterDestroy(name, fn)`. */
    declare static afterDestroy: NamedHookAdder;

    /** Adds a `beforeRestore` hook: `Model.beforeRestore(fn)` or `Model.beforeRestore(name, fn)`. */
    declare static beforeRestore: NamedHookAdder;

    /** Adds a `afterRestore` hook: `Model.afterRestore(fn)` or `Model.afterRestore(name, fn)`. */
    declare static afterRestore: NamedHookAdder;

    /** Adds a `beforeUpsert` hook: `Model.beforeUpsert(fn)` or `Model.beforeUpsert(name, fn)`. */
    declare static beforeUpsert: NamedHookAdder;

    /** Adds a `afterUpsert` hook: `Model.afterUpsert(fn)` or `Model.afterUpsert(name, fn)`. */
    declare static afterUpsert: NamedHookAdder;

    /** Adds a `beforeBulkCreate` hook: `Model.beforeBulkCreate(fn)` or `Model.beforeBulkCreate(name, fn)`. */
    declare static beforeBulkCreate: NamedHookAdder;

    /** Adds a `afterBulkCreate` hook: `Model.afterBulkCreate(fn)` or `Model.afterBulkCreate(name, fn)`. */
    declare static afterBulkCreate: NamedHookAdder;

    /** Adds a `beforeBulkUpdate` hook: `Model.beforeBulkUpdate(fn)` or `Model.beforeBulkUpdate(name, fn)`. */
    declare static beforeBulkUpdate: NamedHookAdder;

    /** Adds a `afterBulkUpdate` hook: `Model.afterBulkUpdate(fn)` or `Model.afterBulkUpdate(name, fn)`. */
    declare static afterBulkUpdate: NamedHookAdder;

    /** Adds a `beforeBulkDestroy` hook: `Model.beforeBulkDestroy(fn)` or `Model.beforeBulkDestroy(name, fn)`. */
    declare static beforeBulkDestroy: NamedHookAdder;

    /** Adds a `afterBulkDestroy` hook: `Model.afterBulkDestroy(fn)` or `Model.afterBulkDestroy(name, fn)`. */
    declare static afterBulkDestroy: NamedHookAdder;

    /** Adds a `beforeBulkRestore` hook: `Model.beforeBulkRestore(fn)` or `Model.beforeBulkRestore(name, fn)`. */
    declare static beforeBulkRestore: NamedHookAdder;

    /** Adds a `afterBulkRestore` hook: `Model.afterBulkRestore(fn)` or `Model.afterBulkRestore(name, fn)`. */
    declare static afterBulkRestore: NamedHookAdder;

    /** Adds a `beforeFind` hook: `Model.beforeFind(fn)` or `Model.beforeFind(name, fn)`. */
    declare static beforeFind: NamedHookAdder;

    /** Adds a `beforeFindAfterExpandIncludeAll` hook: `Model.beforeFindAfterExpandIncludeAll(fn)` or `Model.beforeFindAfterExpandIncludeAll(name, fn)`. */
    declare static beforeFindAfterExpandIncludeAll: NamedHookAdder;

    /** Adds a `beforeFindAfterOptions` hook: `Model.beforeFindAfterOptions(fn)` or `Model.beforeFindAfterOptions(name, fn)`. */
    declare static beforeFindAfterOptions: NamedHookAdder;

    /** Adds a `afterFind` hook: `Model.afterFind(fn)` or `Model.afterFind(name, fn)`. */
    declare static afterFind: NamedHookAdder;

    /** Adds a `beforeCount` hook: `Model.beforeCount(fn)` or `Model.beforeCount(name, fn)`. */
    declare static beforeCount: NamedHookAdder;

    /**
     * Registers a hook function for a lifecycle event of this model, same as the named adders such as
     * `Model.beforeCreate(fn)`. Hooks of one type run in registration order.
     *
     * @param this - The model class.
     * @param type - Hook type, e.g. `'beforeCreate'`.
     * @param nameOrFn - Hook name (to remove it later) or the hook function.
     * @param fn - Hook function when a name is given.
     * @returns The model class.
     * @example
     * ```ts
     * User.addHook('beforeCreate', 'normalizeEmail', async (instance: User) => {
     *   instance.set('email', String(instance.get('email')).toLowerCase());
     * });
     * ```
     * @see [Hooks guide](/guide/hooks-validation)
     */
    static addHook<MS extends ModelStatic<AnyModel>>(
      this: MS,
      type: HookType,
      nameOrFn: string | HookFunction,
      fn?: HookFunction,
    ): MS {
      registry.addHook(this, type, nameOrFn, fn);
      return this;
    }

    /**
     * Removes hooks of a type from this model: one by name or function, or all of them.
     *
     * @param this - The model class.
     * @param type - Hook type.
     * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
     * @returns The model class.
     * @example
     * ```ts
     * User.removeHook('beforeCreate', 'normalizeEmail');
     * ```
     */
    static removeHook<MS extends ModelStatic<AnyModel>>(
      this: MS,
      type: HookType,
      nameOrFn?: string | HookFunction,
    ): MS {
      registry.removeHook(this, type, nameOrFn);
      return this;
    }

    /**
     * Checks whether hooks of the type are registered on the model.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists, `false` after all were removed and
     * `undefined` (typed `boolean`, like Sequelize v6) for a type that never had a hook.
     * @example
     * ```ts
     * const registered = User.hasHook('beforeCreate');
     * ```
     */
    static hasHook(type: HookType): boolean {
      return registry.state(this).hooks.hasOrUndefined(type) as boolean;
    }

    /**
     * Alias of {@link Model.hasHook}.
     *
     * @param type - Hook type.
     * @returns Same as {@link Model.hasHook}.
     * @example
     * ```ts
     * const registered = User.hasHooks('afterFind');
     * ```
     */
    static hasHooks(type: HookType): boolean {
      return this.hasHook(type);
    }

    /**
     * Runs the hooks of a type with the given arguments (model hooks, then Sequelize-level hooks).
     *
     * @param type - Hook type.
     * @param args - Hook arguments.
     * @returns Resolves when all hooks finished.
     * @example
     * ```ts
     * await User.runHooks('beforeCreate', user, {});
     * ```
     */
    static runHooks(type: HookType, ...args: readonly unknown[]): Promise<void> {
      return lifecycle.runHooks(this, type, ...args);
    }
  };
  NAMED_HOOKS.forEach((type) => {
    Object.defineProperty(Mixin, type, {
      configurable: true,
      writable: true,
      value(this: typeof Mixin, nameOrFn: string | HookFunction, fn?: HookFunction): void {
        (this as unknown as typeof Model).addHook(type, nameOrFn, fn);
      },
    });
  });
  return Mixin;
};
