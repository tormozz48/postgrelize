import { HookRegistry, type HookFunction, type HookType } from '../hooks/hooks.ts';
import type { NamedHookAdder } from '../model/mixins/named-hooks.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';
import { staticHooks } from './static-hook-store.ts';

const missingHook = (): never => {
  throw new Error('addHook: hook function is required');
};

const addStatic = (type: string, nameOrFn: string | HookFunction, fn?: HookFunction): void => {
  staticHooks.registry =
    typeof nameOrFn === 'string'
      ? staticHooks.registry.add(type, fn ?? missingHook(), nameOrFn)
      : staticHooks.registry.add(type, nameOrFn);
};

const staticAdder =
  (type: HookType): NamedHookAdder =>
  (nameOrFn: string | HookFunction, fn?: HookFunction): void => {
    addStatic(type, nameOrFn, fn as HookFunction);
  };

/**
 * Static hook API of `Sequelize` (Sequelize v6 `Sequelize.addHook`, `Sequelize.beforeInit`, ...): hooks that belong to the class,
 * not to an instance. `beforeInit` and `afterInit` run for every instance created afterwards; the other types are stored.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeStaticHooks = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class StaticHooksCapability extends Base {
    /**
     * Static options of v6 (`Sequelize.options.hooks`); assigning an empty object to `hooks` removes every static hook.
     */
    static readonly options: {
      /** Static hooks as v6 stores them; reading gives an empty object, assigning an empty object removes every static hook. */
      hooks: Readonly<Record<string, unknown>>;
    } = {
      get hooks(): Readonly<Record<string, unknown>> {
        return {};
      },
      set hooks(value: Readonly<Record<string, unknown>>) {
        if (Object.keys(value).length === 0) {
          staticHooks.registry = HookRegistry.EMPTY;
        }
      },
    };

    /**
     * Registers a static hook.
     *
     * @param this - The Sequelize class.
     * @param type - Hook type, e.g. `'beforeInit'`.
     * @param nameOrFn - Hook name (to remove it later) or the hook function.
     * @param fn - Hook function when a name is given.
     * @returns The class.
     *
     * @example
     * ```ts
     * Sequelize.addHook('beforeInit', (config: any, options: any) => {
     *   options.logging = false;
     * });
     * ```
     */
    static addHook<T>(
      this: T,
      type: string,
      nameOrFn: string | HookFunction,
      fn?: HookFunction,
    ): T {
      addStatic(type, nameOrFn, fn);
      return this;
    }

    /**
     * Unregisters static hooks by name or by function reference.
     *
     * @param this - The Sequelize class.
     * @param type - Hook type.
     * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
     * @returns The class.
     *
     * @example
     * ```ts
     * Sequelize.removeHook('beforeInit', 'logging');
     * ```
     */
    static removeHook<T>(this: T, type: string, nameOrFn?: string | HookFunction): T {
      staticHooks.registry = staticHooks.registry.remove(type, nameOrFn);
      return this;
    }

    /**
     * Tells whether a static hook of the type exists.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists.
     *
     * @example
     * ```ts
     * Sequelize.hasHook('beforeInit');
     * ```
     */
    static hasHook(type: string): boolean {
      return staticHooks.registry.has(type);
    }

    /**
     * Alias of {@link Sequelize.hasHook} for Sequelize v6 compatibility.
     *
     * @param type - Hook type.
     * @returns True when at least one hook exists.
     *
     * @example
     * ```ts
     * Sequelize.hasHooks('afterInit');
     * ```
     */
    static hasHooks(type: string): boolean {
      return staticHooks.registry.has(type);
    }

    /**
     * Runs the static hooks of a type.
     *
     * @param type - Hook type.
     * @param args - Hook arguments.
     * @returns Resolves when all hooks finished.
     *
     * @example
     * ```ts
     * await Sequelize.runHooks('beforeInit', {}, {});
     * ```
     */
    static runHooks(type: string, ...args: readonly unknown[]): Promise<void> {
      return staticHooks.registry.run(type as HookType, this, ...args);
    }

    /** Adds a global `beforeValidate` hook for every `Sequelize` instance: `Sequelize.beforeValidate(fn)` or `Sequelize.beforeValidate(name, fn)`. */
    static readonly beforeValidate: NamedHookAdder = staticAdder('beforeValidate');
    /** Adds a global `afterValidate` hook for every `Sequelize` instance: `Sequelize.afterValidate(fn)` or `Sequelize.afterValidate(name, fn)`. */
    static readonly afterValidate: NamedHookAdder = staticAdder('afterValidate');
    /** Adds a global `validationFailed` hook for every `Sequelize` instance: `Sequelize.validationFailed(fn)` or `Sequelize.validationFailed(name, fn)`. */
    static readonly validationFailed: NamedHookAdder = staticAdder('validationFailed');
    /** Adds a global `beforeCreate` hook for every `Sequelize` instance: `Sequelize.beforeCreate(fn)` or `Sequelize.beforeCreate(name, fn)`. */
    static readonly beforeCreate: NamedHookAdder = staticAdder('beforeCreate');
    /** Adds a global `afterCreate` hook for every `Sequelize` instance: `Sequelize.afterCreate(fn)` or `Sequelize.afterCreate(name, fn)`. */
    static readonly afterCreate: NamedHookAdder = staticAdder('afterCreate');
    /** Adds a global `beforeUpdate` hook for every `Sequelize` instance: `Sequelize.beforeUpdate(fn)` or `Sequelize.beforeUpdate(name, fn)`. */
    static readonly beforeUpdate: NamedHookAdder = staticAdder('beforeUpdate');
    /** Adds a global `afterUpdate` hook for every `Sequelize` instance: `Sequelize.afterUpdate(fn)` or `Sequelize.afterUpdate(name, fn)`. */
    static readonly afterUpdate: NamedHookAdder = staticAdder('afterUpdate');
    /** Adds a global `beforeSave` hook for every `Sequelize` instance: `Sequelize.beforeSave(fn)` or `Sequelize.beforeSave(name, fn)`. */
    static readonly beforeSave: NamedHookAdder = staticAdder('beforeSave');
    /** Adds a global `afterSave` hook for every `Sequelize` instance: `Sequelize.afterSave(fn)` or `Sequelize.afterSave(name, fn)`. */
    static readonly afterSave: NamedHookAdder = staticAdder('afterSave');
    /** Adds a global `beforeDestroy` hook for every `Sequelize` instance: `Sequelize.beforeDestroy(fn)` or `Sequelize.beforeDestroy(name, fn)`. */
    static readonly beforeDestroy: NamedHookAdder = staticAdder('beforeDestroy');
    /** Adds a global `afterDestroy` hook for every `Sequelize` instance: `Sequelize.afterDestroy(fn)` or `Sequelize.afterDestroy(name, fn)`. */
    static readonly afterDestroy: NamedHookAdder = staticAdder('afterDestroy');
    /** Adds a global `beforeRestore` hook for every `Sequelize` instance: `Sequelize.beforeRestore(fn)` or `Sequelize.beforeRestore(name, fn)`. */
    static readonly beforeRestore: NamedHookAdder = staticAdder('beforeRestore');
    /** Adds a global `afterRestore` hook for every `Sequelize` instance: `Sequelize.afterRestore(fn)` or `Sequelize.afterRestore(name, fn)`. */
    static readonly afterRestore: NamedHookAdder = staticAdder('afterRestore');
    /** Adds a global `beforeUpsert` hook for every `Sequelize` instance: `Sequelize.beforeUpsert(fn)` or `Sequelize.beforeUpsert(name, fn)`. */
    static readonly beforeUpsert: NamedHookAdder = staticAdder('beforeUpsert');
    /** Adds a global `afterUpsert` hook for every `Sequelize` instance: `Sequelize.afterUpsert(fn)` or `Sequelize.afterUpsert(name, fn)`. */
    static readonly afterUpsert: NamedHookAdder = staticAdder('afterUpsert');
    /** Adds a global `beforeBulkCreate` hook for every `Sequelize` instance: `Sequelize.beforeBulkCreate(fn)` or `Sequelize.beforeBulkCreate(name, fn)`. */
    static readonly beforeBulkCreate: NamedHookAdder = staticAdder('beforeBulkCreate');
    /** Adds a global `afterBulkCreate` hook for every `Sequelize` instance: `Sequelize.afterBulkCreate(fn)` or `Sequelize.afterBulkCreate(name, fn)`. */
    static readonly afterBulkCreate: NamedHookAdder = staticAdder('afterBulkCreate');
    /** Adds a global `beforeBulkUpdate` hook for every `Sequelize` instance: `Sequelize.beforeBulkUpdate(fn)` or `Sequelize.beforeBulkUpdate(name, fn)`. */
    static readonly beforeBulkUpdate: NamedHookAdder = staticAdder('beforeBulkUpdate');
    /** Adds a global `afterBulkUpdate` hook for every `Sequelize` instance: `Sequelize.afterBulkUpdate(fn)` or `Sequelize.afterBulkUpdate(name, fn)`. */
    static readonly afterBulkUpdate: NamedHookAdder = staticAdder('afterBulkUpdate');
    /** Adds a global `beforeBulkDestroy` hook for every `Sequelize` instance: `Sequelize.beforeBulkDestroy(fn)` or `Sequelize.beforeBulkDestroy(name, fn)`. */
    static readonly beforeBulkDestroy: NamedHookAdder = staticAdder('beforeBulkDestroy');
    /** Adds a global `afterBulkDestroy` hook for every `Sequelize` instance: `Sequelize.afterBulkDestroy(fn)` or `Sequelize.afterBulkDestroy(name, fn)`. */
    static readonly afterBulkDestroy: NamedHookAdder = staticAdder('afterBulkDestroy');
    /** Adds a global `beforeBulkRestore` hook for every `Sequelize` instance: `Sequelize.beforeBulkRestore(fn)` or `Sequelize.beforeBulkRestore(name, fn)`. */
    static readonly beforeBulkRestore: NamedHookAdder = staticAdder('beforeBulkRestore');
    /** Adds a global `afterBulkRestore` hook for every `Sequelize` instance: `Sequelize.afterBulkRestore(fn)` or `Sequelize.afterBulkRestore(name, fn)`. */
    static readonly afterBulkRestore: NamedHookAdder = staticAdder('afterBulkRestore');
    /** Adds a global `beforeFind` hook for every `Sequelize` instance: `Sequelize.beforeFind(fn)` or `Sequelize.beforeFind(name, fn)`. */
    static readonly beforeFind: NamedHookAdder = staticAdder('beforeFind');
    /** Adds a global `beforeFindAfterExpandIncludeAll` hook for every `Sequelize` instance: `Sequelize.beforeFindAfterExpandIncludeAll(fn)` or `Sequelize.beforeFindAfterExpandIncludeAll(name, fn)`. */
    static readonly beforeFindAfterExpandIncludeAll: NamedHookAdder = staticAdder(
      'beforeFindAfterExpandIncludeAll',
    );
    /** Adds a global `beforeFindAfterOptions` hook for every `Sequelize` instance: `Sequelize.beforeFindAfterOptions(fn)` or `Sequelize.beforeFindAfterOptions(name, fn)`. */
    static readonly beforeFindAfterOptions: NamedHookAdder = staticAdder('beforeFindAfterOptions');
    /** Adds a global `afterFind` hook for every `Sequelize` instance: `Sequelize.afterFind(fn)` or `Sequelize.afterFind(name, fn)`. */
    static readonly afterFind: NamedHookAdder = staticAdder('afterFind');
    /** Adds a global `beforeCount` hook for every `Sequelize` instance: `Sequelize.beforeCount(fn)` or `Sequelize.beforeCount(name, fn)`. */
    static readonly beforeCount: NamedHookAdder = staticAdder('beforeCount');
    /** Adds a global `beforeConnect` hook for every `Sequelize` instance: `Sequelize.beforeConnect(fn)` or `Sequelize.beforeConnect(name, fn)`. */
    static readonly beforeConnect: NamedHookAdder = staticAdder('beforeConnect');
    /** Adds a global `afterConnect` hook for every `Sequelize` instance: `Sequelize.afterConnect(fn)` or `Sequelize.afterConnect(name, fn)`. */
    static readonly afterConnect: NamedHookAdder = staticAdder('afterConnect');
    /** Adds a global `beforeDisconnect` hook for every `Sequelize` instance: `Sequelize.beforeDisconnect(fn)` or `Sequelize.beforeDisconnect(name, fn)`. */
    static readonly beforeDisconnect: NamedHookAdder = staticAdder('beforeDisconnect');
    /** Adds a global `afterDisconnect` hook for every `Sequelize` instance: `Sequelize.afterDisconnect(fn)` or `Sequelize.afterDisconnect(name, fn)`. */
    static readonly afterDisconnect: NamedHookAdder = staticAdder('afterDisconnect');
    /** Adds a global `beforePoolAcquire` hook for every `Sequelize` instance: `Sequelize.beforePoolAcquire(fn)` or `Sequelize.beforePoolAcquire(name, fn)`. */
    static readonly beforePoolAcquire: NamedHookAdder = staticAdder('beforePoolAcquire');
    /** Adds a global `afterPoolAcquire` hook for every `Sequelize` instance: `Sequelize.afterPoolAcquire(fn)` or `Sequelize.afterPoolAcquire(name, fn)`. */
    static readonly afterPoolAcquire: NamedHookAdder = staticAdder('afterPoolAcquire');
    /** Adds a global `beforeQuery` hook for every `Sequelize` instance: `Sequelize.beforeQuery(fn)` or `Sequelize.beforeQuery(name, fn)`. */
    static readonly beforeQuery: NamedHookAdder = staticAdder('beforeQuery');
    /** Adds a global `afterQuery` hook for every `Sequelize` instance: `Sequelize.afterQuery(fn)` or `Sequelize.afterQuery(name, fn)`. */
    static readonly afterQuery: NamedHookAdder = staticAdder('afterQuery');
    /** Adds a global `beforeSync` hook for every `Sequelize` instance: `Sequelize.beforeSync(fn)` or `Sequelize.beforeSync(name, fn)`. */
    static readonly beforeSync: NamedHookAdder = staticAdder('beforeSync');
    /** Adds a global `afterSync` hook for every `Sequelize` instance: `Sequelize.afterSync(fn)` or `Sequelize.afterSync(name, fn)`. */
    static readonly afterSync: NamedHookAdder = staticAdder('afterSync');
    /** Adds a global `beforeBulkSync` hook for every `Sequelize` instance: `Sequelize.beforeBulkSync(fn)` or `Sequelize.beforeBulkSync(name, fn)`. */
    static readonly beforeBulkSync: NamedHookAdder = staticAdder('beforeBulkSync');
    /** Adds a global `afterBulkSync` hook for every `Sequelize` instance: `Sequelize.afterBulkSync(fn)` or `Sequelize.afterBulkSync(name, fn)`. */
    static readonly afterBulkSync: NamedHookAdder = staticAdder('afterBulkSync');
    /** Adds a global `beforeDefine` hook for every `Sequelize` instance: `Sequelize.beforeDefine(fn)` or `Sequelize.beforeDefine(name, fn)`. */
    static readonly beforeDefine: NamedHookAdder = staticAdder('beforeDefine');
    /** Adds a global `afterDefine` hook for every `Sequelize` instance: `Sequelize.afterDefine(fn)` or `Sequelize.afterDefine(name, fn)`. */
    static readonly afterDefine: NamedHookAdder = staticAdder('afterDefine');
    /** Adds a global `beforeInit` hook for every `Sequelize` instance: `Sequelize.beforeInit(fn)` or `Sequelize.beforeInit(name, fn)`. */
    static readonly beforeInit: NamedHookAdder = staticAdder('beforeInit');
    /** Adds a global `afterInit` hook for every `Sequelize` instance: `Sequelize.afterInit(fn)` or `Sequelize.afterInit(name, fn)`. */
    static readonly afterInit: NamedHookAdder = staticAdder('afterInit');
    /** Adds a global `beforeAssociate` hook for every `Sequelize` instance: `Sequelize.beforeAssociate(fn)` or `Sequelize.beforeAssociate(name, fn)`. */
    static readonly beforeAssociate: NamedHookAdder = staticAdder('beforeAssociate');
    /** Adds a global `afterAssociate` hook for every `Sequelize` instance: `Sequelize.afterAssociate(fn)` or `Sequelize.afterAssociate(name, fn)`. */
    static readonly afterAssociate: NamedHookAdder = staticAdder('afterAssociate');
  };
