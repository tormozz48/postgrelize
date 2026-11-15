import type { HookFunction, HookType } from '../../hooks/hooks.ts';

/** Named hook method of a model class, e.g. `Model.beforeCreate`. */
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
] as const satisfies readonly HookType[];
