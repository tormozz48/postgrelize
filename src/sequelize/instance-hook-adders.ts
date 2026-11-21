import type { NamedHookAdder } from '../model/mixins/named-hooks.ts';

/** Named hook adders of a `Sequelize` instance: `sequelize.beforeCreate(fn)` or `sequelize.beforeCreate(name, fn)` register a global hook. */
export interface InstanceHookAdders {
  /** Adds a global `beforeValidate` hook: `sequelize.beforeValidate(fn)` or `sequelize.beforeValidate(name, fn)`. */
  readonly beforeValidate: NamedHookAdder;
  /** Adds a global `afterValidate` hook: `sequelize.afterValidate(fn)` or `sequelize.afterValidate(name, fn)`. */
  readonly afterValidate: NamedHookAdder;
  /** Adds a global `validationFailed` hook: `sequelize.validationFailed(fn)` or `sequelize.validationFailed(name, fn)`. */
  readonly validationFailed: NamedHookAdder;
  /** Adds a global `beforeCreate` hook: `sequelize.beforeCreate(fn)` or `sequelize.beforeCreate(name, fn)`. */
  readonly beforeCreate: NamedHookAdder;
  /** Adds a global `afterCreate` hook: `sequelize.afterCreate(fn)` or `sequelize.afterCreate(name, fn)`. */
  readonly afterCreate: NamedHookAdder;
  /** Adds a global `beforeUpdate` hook: `sequelize.beforeUpdate(fn)` or `sequelize.beforeUpdate(name, fn)`. */
  readonly beforeUpdate: NamedHookAdder;
  /** Adds a global `afterUpdate` hook: `sequelize.afterUpdate(fn)` or `sequelize.afterUpdate(name, fn)`. */
  readonly afterUpdate: NamedHookAdder;
  /** Adds a global `beforeSave` hook: `sequelize.beforeSave(fn)` or `sequelize.beforeSave(name, fn)`. */
  readonly beforeSave: NamedHookAdder;
  /** Adds a global `afterSave` hook: `sequelize.afterSave(fn)` or `sequelize.afterSave(name, fn)`. */
  readonly afterSave: NamedHookAdder;
  /** Adds a global `beforeDestroy` hook: `sequelize.beforeDestroy(fn)` or `sequelize.beforeDestroy(name, fn)`. */
  readonly beforeDestroy: NamedHookAdder;
  /** Adds a global `afterDestroy` hook: `sequelize.afterDestroy(fn)` or `sequelize.afterDestroy(name, fn)`. */
  readonly afterDestroy: NamedHookAdder;
  /** Adds a global `beforeRestore` hook: `sequelize.beforeRestore(fn)` or `sequelize.beforeRestore(name, fn)`. */
  readonly beforeRestore: NamedHookAdder;
  /** Adds a global `afterRestore` hook: `sequelize.afterRestore(fn)` or `sequelize.afterRestore(name, fn)`. */
  readonly afterRestore: NamedHookAdder;
  /** Adds a global `beforeUpsert` hook: `sequelize.beforeUpsert(fn)` or `sequelize.beforeUpsert(name, fn)`. */
  readonly beforeUpsert: NamedHookAdder;
  /** Adds a global `afterUpsert` hook: `sequelize.afterUpsert(fn)` or `sequelize.afterUpsert(name, fn)`. */
  readonly afterUpsert: NamedHookAdder;
  /** Adds a global `beforeBulkCreate` hook: `sequelize.beforeBulkCreate(fn)` or `sequelize.beforeBulkCreate(name, fn)`. */
  readonly beforeBulkCreate: NamedHookAdder;
  /** Adds a global `afterBulkCreate` hook: `sequelize.afterBulkCreate(fn)` or `sequelize.afterBulkCreate(name, fn)`. */
  readonly afterBulkCreate: NamedHookAdder;
  /** Adds a global `beforeBulkUpdate` hook: `sequelize.beforeBulkUpdate(fn)` or `sequelize.beforeBulkUpdate(name, fn)`. */
  readonly beforeBulkUpdate: NamedHookAdder;
  /** Adds a global `afterBulkUpdate` hook: `sequelize.afterBulkUpdate(fn)` or `sequelize.afterBulkUpdate(name, fn)`. */
  readonly afterBulkUpdate: NamedHookAdder;
  /** Adds a global `beforeBulkDestroy` hook: `sequelize.beforeBulkDestroy(fn)` or `sequelize.beforeBulkDestroy(name, fn)`. */
  readonly beforeBulkDestroy: NamedHookAdder;
  /** Adds a global `afterBulkDestroy` hook: `sequelize.afterBulkDestroy(fn)` or `sequelize.afterBulkDestroy(name, fn)`. */
  readonly afterBulkDestroy: NamedHookAdder;
  /** Adds a global `beforeBulkRestore` hook: `sequelize.beforeBulkRestore(fn)` or `sequelize.beforeBulkRestore(name, fn)`. */
  readonly beforeBulkRestore: NamedHookAdder;
  /** Adds a global `afterBulkRestore` hook: `sequelize.afterBulkRestore(fn)` or `sequelize.afterBulkRestore(name, fn)`. */
  readonly afterBulkRestore: NamedHookAdder;
  /** Adds a global `beforeFind` hook: `sequelize.beforeFind(fn)` or `sequelize.beforeFind(name, fn)`. */
  readonly beforeFind: NamedHookAdder;
  /** Adds a global `beforeFindAfterExpandIncludeAll` hook: `sequelize.beforeFindAfterExpandIncludeAll(fn)` or `sequelize.beforeFindAfterExpandIncludeAll(name, fn)`. */
  readonly beforeFindAfterExpandIncludeAll: NamedHookAdder;
  /** Adds a global `beforeFindAfterOptions` hook: `sequelize.beforeFindAfterOptions(fn)` or `sequelize.beforeFindAfterOptions(name, fn)`. */
  readonly beforeFindAfterOptions: NamedHookAdder;
  /** Adds a global `afterFind` hook: `sequelize.afterFind(fn)` or `sequelize.afterFind(name, fn)`. */
  readonly afterFind: NamedHookAdder;
  /** Adds a global `beforeCount` hook: `sequelize.beforeCount(fn)` or `sequelize.beforeCount(name, fn)`. */
  readonly beforeCount: NamedHookAdder;
  /** Adds a global `beforeSync` hook: `sequelize.beforeSync(fn)` or `sequelize.beforeSync(name, fn)`. */
  readonly beforeSync: NamedHookAdder;
  /** Adds a global `afterSync` hook: `sequelize.afterSync(fn)` or `sequelize.afterSync(name, fn)`. */
  readonly afterSync: NamedHookAdder;
  /** Adds a global `beforeConnect` hook: `sequelize.beforeConnect(fn)` or `sequelize.beforeConnect(name, fn)`. */
  readonly beforeConnect: NamedHookAdder;
  /** Adds a global `afterConnect` hook: `sequelize.afterConnect(fn)` or `sequelize.afterConnect(name, fn)`. */
  readonly afterConnect: NamedHookAdder;
  /** Adds a global `beforeBulkSync` hook: `sequelize.beforeBulkSync(fn)` or `sequelize.beforeBulkSync(name, fn)`. */
  readonly beforeBulkSync: NamedHookAdder;
  /** Adds a global `afterBulkSync` hook: `sequelize.afterBulkSync(fn)` or `sequelize.afterBulkSync(name, fn)`. */
  readonly afterBulkSync: NamedHookAdder;
}
