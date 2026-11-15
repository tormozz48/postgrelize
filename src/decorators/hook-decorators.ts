import { decorate } from './decorator-factory.ts';
import type { ModelStaticMethodDecorator } from './decorator-types.ts';

/**
 * Registers the decorated static method as a `beforeValidate` hook of the model (like `Model.beforeValidate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeValidate
 * static async onBeforeValidate(...args: unknown[]) {}
 * ```
 */
export const BeforeValidate: ModelStaticMethodDecorator = decorate.forHook('beforeValidate');

/**
 * Registers the decorated static method as a `afterValidate` hook of the model (like `Model.afterValidate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterValidate
 * static async onAfterValidate(...args: unknown[]) {}
 * ```
 */
export const AfterValidate: ModelStaticMethodDecorator = decorate.forHook('afterValidate');

/**
 * Registers the decorated static method as a `validationFailed` hook of the model (like `Model.validationFailed`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @ValidationFailed
 * static async onValidationFailed(...args: unknown[]) {}
 * ```
 */
export const ValidationFailed: ModelStaticMethodDecorator = decorate.forHook('validationFailed');

/**
 * Registers the decorated static method as a `beforeCreate` hook of the model (like `Model.beforeCreate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeCreate
 * static async onBeforeCreate(...args: unknown[]) {}
 * ```
 */
export const BeforeCreate: ModelStaticMethodDecorator = decorate.forHook('beforeCreate');

/**
 * Registers the decorated static method as a `afterCreate` hook of the model (like `Model.afterCreate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterCreate
 * static async onAfterCreate(...args: unknown[]) {}
 * ```
 */
export const AfterCreate: ModelStaticMethodDecorator = decorate.forHook('afterCreate');

/**
 * Registers the decorated static method as a `beforeUpdate` hook of the model (like `Model.beforeUpdate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeUpdate
 * static async onBeforeUpdate(...args: unknown[]) {}
 * ```
 */
export const BeforeUpdate: ModelStaticMethodDecorator = decorate.forHook('beforeUpdate');

/**
 * Registers the decorated static method as a `afterUpdate` hook of the model (like `Model.afterUpdate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterUpdate
 * static async onAfterUpdate(...args: unknown[]) {}
 * ```
 */
export const AfterUpdate: ModelStaticMethodDecorator = decorate.forHook('afterUpdate');

/**
 * Registers the decorated static method as a `beforeSave` hook of the model (like `Model.beforeSave`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeSave
 * static async onBeforeSave(...args: unknown[]) {}
 * ```
 */
export const BeforeSave: ModelStaticMethodDecorator = decorate.forHook('beforeSave');

/**
 * Registers the decorated static method as a `afterSave` hook of the model (like `Model.afterSave`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterSave
 * static async onAfterSave(...args: unknown[]) {}
 * ```
 */
export const AfterSave: ModelStaticMethodDecorator = decorate.forHook('afterSave');

/**
 * Registers the decorated static method as a `beforeDestroy` hook of the model (like `Model.beforeDestroy`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeDestroy
 * static async onBeforeDestroy(...args: unknown[]) {}
 * ```
 */
export const BeforeDestroy: ModelStaticMethodDecorator = decorate.forHook('beforeDestroy');

/**
 * Registers the decorated static method as a `afterDestroy` hook of the model (like `Model.afterDestroy`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterDestroy
 * static async onAfterDestroy(...args: unknown[]) {}
 * ```
 */
export const AfterDestroy: ModelStaticMethodDecorator = decorate.forHook('afterDestroy');

/**
 * Registers the decorated static method as a `beforeRestore` hook of the model (like `Model.beforeRestore`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeRestore
 * static async onBeforeRestore(...args: unknown[]) {}
 * ```
 */
export const BeforeRestore: ModelStaticMethodDecorator = decorate.forHook('beforeRestore');

/**
 * Registers the decorated static method as a `afterRestore` hook of the model (like `Model.afterRestore`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterRestore
 * static async onAfterRestore(...args: unknown[]) {}
 * ```
 */
export const AfterRestore: ModelStaticMethodDecorator = decorate.forHook('afterRestore');

/**
 * Registers the decorated static method as a `beforeUpsert` hook of the model (like `Model.beforeUpsert`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeUpsert
 * static async onBeforeUpsert(...args: unknown[]) {}
 * ```
 */
export const BeforeUpsert: ModelStaticMethodDecorator = decorate.forHook('beforeUpsert');

/**
 * Registers the decorated static method as a `afterUpsert` hook of the model (like `Model.afterUpsert`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterUpsert
 * static async onAfterUpsert(...args: unknown[]) {}
 * ```
 */
export const AfterUpsert: ModelStaticMethodDecorator = decorate.forHook('afterUpsert');

/**
 * Registers the decorated static method as a `beforeBulkCreate` hook of the model (like `Model.beforeBulkCreate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeBulkCreate
 * static async onBeforeBulkCreate(...args: unknown[]) {}
 * ```
 */
export const BeforeBulkCreate: ModelStaticMethodDecorator = decorate.forHook('beforeBulkCreate');

/**
 * Registers the decorated static method as a `afterBulkCreate` hook of the model (like `Model.afterBulkCreate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterBulkCreate
 * static async onAfterBulkCreate(...args: unknown[]) {}
 * ```
 */
export const AfterBulkCreate: ModelStaticMethodDecorator = decorate.forHook('afterBulkCreate');

/**
 * Registers the decorated static method as a `beforeBulkUpdate` hook of the model (like `Model.beforeBulkUpdate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeBulkUpdate
 * static async onBeforeBulkUpdate(...args: unknown[]) {}
 * ```
 */
export const BeforeBulkUpdate: ModelStaticMethodDecorator = decorate.forHook('beforeBulkUpdate');

/**
 * Registers the decorated static method as a `afterBulkUpdate` hook of the model (like `Model.afterBulkUpdate`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterBulkUpdate
 * static async onAfterBulkUpdate(...args: unknown[]) {}
 * ```
 */
export const AfterBulkUpdate: ModelStaticMethodDecorator = decorate.forHook('afterBulkUpdate');

/**
 * Registers the decorated static method as a `beforeBulkDestroy` hook of the model (like `Model.beforeBulkDestroy`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeBulkDestroy
 * static async onBeforeBulkDestroy(...args: unknown[]) {}
 * ```
 */
export const BeforeBulkDestroy: ModelStaticMethodDecorator = decorate.forHook('beforeBulkDestroy');

/**
 * Registers the decorated static method as a `afterBulkDestroy` hook of the model (like `Model.afterBulkDestroy`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterBulkDestroy
 * static async onAfterBulkDestroy(...args: unknown[]) {}
 * ```
 */
export const AfterBulkDestroy: ModelStaticMethodDecorator = decorate.forHook('afterBulkDestroy');

/**
 * Registers the decorated static method as a `beforeBulkRestore` hook of the model (like `Model.beforeBulkRestore`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeBulkRestore
 * static async onBeforeBulkRestore(...args: unknown[]) {}
 * ```
 */
export const BeforeBulkRestore: ModelStaticMethodDecorator = decorate.forHook('beforeBulkRestore');

/**
 * Registers the decorated static method as a `afterBulkRestore` hook of the model (like `Model.afterBulkRestore`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterBulkRestore
 * static async onAfterBulkRestore(...args: unknown[]) {}
 * ```
 */
export const AfterBulkRestore: ModelStaticMethodDecorator = decorate.forHook('afterBulkRestore');

/**
 * Registers the decorated static method as a `beforeFind` hook of the model (like `Model.beforeFind`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeFind
 * static async onBeforeFind(...args: unknown[]) {}
 * ```
 */
export const BeforeFind: ModelStaticMethodDecorator = decorate.forHook('beforeFind');

/**
 * Registers the decorated static method as a `beforeFindAfterExpandIncludeAll` hook of the model (like `Model.beforeFindAfterExpandIncludeAll`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeFindAfterExpandIncludeAll
 * static async onBeforeFindAfterExpandIncludeAll(...args: unknown[]) {}
 * ```
 */
export const BeforeFindAfterExpandIncludeAll: ModelStaticMethodDecorator = decorate.forHook(
  'beforeFindAfterExpandIncludeAll',
);

/**
 * Registers the decorated static method as a `beforeFindAfterOptions` hook of the model (like `Model.beforeFindAfterOptions`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeFindAfterOptions
 * static async onBeforeFindAfterOptions(...args: unknown[]) {}
 * ```
 */
export const BeforeFindAfterOptions: ModelStaticMethodDecorator =
  decorate.forHook('beforeFindAfterOptions');

/**
 * Registers the decorated static method as a `afterFind` hook of the model (like `Model.afterFind`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @AfterFind
 * static async onAfterFind(...args: unknown[]) {}
 * ```
 */
export const AfterFind: ModelStaticMethodDecorator = decorate.forHook('afterFind');

/**
 * Registers the decorated static method as a `beforeCount` hook of the model (like `Model.beforeCount`). It receives the hook arguments; static methods only.
 *
 * @example
 * ```ts
 * @BeforeCount
 * static async onBeforeCount(...args: unknown[]) {}
 * ```
 */
export const BeforeCount: ModelStaticMethodDecorator = decorate.forHook('beforeCount');
