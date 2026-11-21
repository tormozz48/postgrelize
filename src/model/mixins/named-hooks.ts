import type { HookFunction, HookType } from '../../hooks/hooks.ts';

/**
 * Named hook method of a model class, e.g. `Model.beforeCreate`: registers a hook function, optionally under a name that
 * {@link Model.removeHook} can use later.
 *
 * @example
 * ```ts
 * User.beforeCreate(async (instance: User) => {
 *   instance.set('email', String(instance.get('email')).trim());
 * });
 * User.afterCreate('audit', async (instance: User) => {
 *   console.log('created', instance.get('id'));
 * });
 * ```
 */
export type NamedHookAdder = {
  /**
   * @param fn - Hook function.
   */
  (fn: HookFunction): void;
  /**
   * @param name - Hook name, used to remove it later.
   * @param fn - Hook function.
   */
  (name: string, fn: HookFunction): void;
};

/** @internal Hook types that get a named adder method on model classes. */
export const NAMED_HOOKS = [
  'beforeValidate',
  'afterValidate',
  'validationFailed',
  'beforeCreate',
  'afterCreate',
  'beforeUpdate',
  'afterUpdate',
  'beforeSave',
  'afterSave',
  'beforeDestroy',
  'afterDestroy',
  'beforeRestore',
  'afterRestore',
  'beforeUpsert',
  'afterUpsert',
  'beforeBulkCreate',
  'afterBulkCreate',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeBulkRestore',
  'afterBulkRestore',
  'beforeFind',
  'beforeFindAfterExpandIncludeAll',
  'beforeFindAfterOptions',
  'afterFind',
  'beforeCount',
  'beforeSync',
  'afterSync',
] as const satisfies readonly HookType[];
