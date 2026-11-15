import { decorate } from './decorator-factory.ts';
import type { ModelStaticMethodDecorator } from './decorator-types.ts';

/**
 * Registers the decorated static method as a `beforeValidate` hook of the model (like `Model.beforeValidate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeValidate
 *   static async onBeforeValidate(user: User, options: unknown) {}
 * }
 * ```
 */
export const BeforeValidate: ModelStaticMethodDecorator = decorate.forHook('beforeValidate');

/**
 * Registers the decorated static method as an `afterValidate` hook of the model (like `Model.afterValidate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterValidate
 *   static async onAfterValidate(user: User, options: unknown) {}
 * }
 * ```
 */
export const AfterValidate: ModelStaticMethodDecorator = decorate.forHook('afterValidate');

/**
 * Registers the decorated static method as a `validationFailed` hook of the model (like `Model.validationFailed`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @ValidationFailed
 *   static async onValidationFailed(user: User, options: unknown, error: unknown) {}
 * }
 * ```
 */
export const ValidationFailed: ModelStaticMethodDecorator = decorate.forHook('validationFailed');

/**
 * Registers the decorated static method as a `beforeCreate` hook of the model (like `Model.beforeCreate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeCreate
 *   static async onBeforeCreate(user: User, options: unknown) {}
 * }
 * ```
 */
export const BeforeCreate: ModelStaticMethodDecorator = decorate.forHook('beforeCreate');

/**
 * Registers the decorated static method as an `afterCreate` hook of the model (like `Model.afterCreate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterCreate
 *   static async onAfterCreate(user: User, options: unknown) {}
 * }
 * ```
 */
export const AfterCreate: ModelStaticMethodDecorator = decorate.forHook('afterCreate');

/**
 * Registers the decorated static method as a `beforeUpdate` hook of the model (like `Model.beforeUpdate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeUpdate
 *   static async onBeforeUpdate(user: User, options: unknown) {}
 * }
 * ```
 */
export const BeforeUpdate: ModelStaticMethodDecorator = decorate.forHook('beforeUpdate');

/**
 * Registers the decorated static method as an `afterUpdate` hook of the model (like `Model.afterUpdate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterUpdate
 *   static async onAfterUpdate(user: User, options: unknown) {}
 * }
 * ```
 */
export const AfterUpdate: ModelStaticMethodDecorator = decorate.forHook('afterUpdate');

/**
 * Registers the decorated static method as a `beforeSave` hook of the model (like `Model.beforeSave`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeSave
 *   static async onBeforeSave(user: User, options: unknown) {}
 * }
 * ```
 */
export const BeforeSave: ModelStaticMethodDecorator = decorate.forHook('beforeSave');

/**
 * Registers the decorated static method as an `afterSave` hook of the model (like `Model.afterSave`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterSave
 *   static async onAfterSave(user: User, options: unknown) {}
 * }
 * ```
 */
export const AfterSave: ModelStaticMethodDecorator = decorate.forHook('afterSave');

/**
 * Registers the decorated static method as a `beforeDestroy` hook of the model (like `Model.beforeDestroy`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeDestroy
 *   static async onBeforeDestroy(user: User, options: unknown) {}
 * }
 * ```
 */
export const BeforeDestroy: ModelStaticMethodDecorator = decorate.forHook('beforeDestroy');

/**
 * Registers the decorated static method as an `afterDestroy` hook of the model (like `Model.afterDestroy`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterDestroy
 *   static async onAfterDestroy(user: User, options: unknown) {}
 * }
 * ```
 */
export const AfterDestroy: ModelStaticMethodDecorator = decorate.forHook('afterDestroy');

/**
 * Registers the decorated static method as a `beforeRestore` hook of the model (like `Model.beforeRestore`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeRestore
 *   static async onBeforeRestore(user: User, options: unknown) {}
 * }
 * ```
 */
export const BeforeRestore: ModelStaticMethodDecorator = decorate.forHook('beforeRestore');

/**
 * Registers the decorated static method as an `afterRestore` hook of the model (like `Model.afterRestore`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterRestore
 *   static async onAfterRestore(user: User, options: unknown) {}
 * }
 * ```
 */
export const AfterRestore: ModelStaticMethodDecorator = decorate.forHook('afterRestore');

/**
 * Registers the decorated static method as a `beforeUpsert` hook of the model (like `Model.beforeUpsert`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeUpsert
 *   static async onBeforeUpsert(values: unknown, options: unknown) {}
 * }
 * ```
 */
export const BeforeUpsert: ModelStaticMethodDecorator = decorate.forHook('beforeUpsert');

/**
 * Registers the decorated static method as an `afterUpsert` hook of the model (like `Model.afterUpsert`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterUpsert
 *   static async onAfterUpsert(result: unknown, options: unknown) {}
 * }
 * ```
 */
export const AfterUpsert: ModelStaticMethodDecorator = decorate.forHook('afterUpsert');

/**
 * Registers the decorated static method as a `beforeBulkCreate` hook of the model (like `Model.beforeBulkCreate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeBulkCreate
 *   static async onBeforeBulkCreate(users: User[], options: unknown) {}
 * }
 * ```
 */
export const BeforeBulkCreate: ModelStaticMethodDecorator = decorate.forHook('beforeBulkCreate');

/**
 * Registers the decorated static method as an `afterBulkCreate` hook of the model (like `Model.afterBulkCreate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterBulkCreate
 *   static async onAfterBulkCreate(users: User[], options: unknown) {}
 * }
 * ```
 */
export const AfterBulkCreate: ModelStaticMethodDecorator = decorate.forHook('afterBulkCreate');

/**
 * Registers the decorated static method as a `beforeBulkUpdate` hook of the model (like `Model.beforeBulkUpdate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeBulkUpdate
 *   static async onBeforeBulkUpdate(options: unknown) {}
 * }
 * ```
 */
export const BeforeBulkUpdate: ModelStaticMethodDecorator = decorate.forHook('beforeBulkUpdate');

/**
 * Registers the decorated static method as an `afterBulkUpdate` hook of the model (like `Model.afterBulkUpdate`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterBulkUpdate
 *   static async onAfterBulkUpdate(options: unknown) {}
 * }
 * ```
 */
export const AfterBulkUpdate: ModelStaticMethodDecorator = decorate.forHook('afterBulkUpdate');

/**
 * Registers the decorated static method as a `beforeBulkDestroy` hook of the model (like `Model.beforeBulkDestroy`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeBulkDestroy
 *   static async onBeforeBulkDestroy(options: unknown) {}
 * }
 * ```
 */
export const BeforeBulkDestroy: ModelStaticMethodDecorator = decorate.forHook('beforeBulkDestroy');

/**
 * Registers the decorated static method as an `afterBulkDestroy` hook of the model (like `Model.afterBulkDestroy`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterBulkDestroy
 *   static async onAfterBulkDestroy(options: unknown) {}
 * }
 * ```
 */
export const AfterBulkDestroy: ModelStaticMethodDecorator = decorate.forHook('afterBulkDestroy');

/**
 * Registers the decorated static method as a `beforeBulkRestore` hook of the model (like `Model.beforeBulkRestore`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeBulkRestore
 *   static async onBeforeBulkRestore(options: unknown) {}
 * }
 * ```
 */
export const BeforeBulkRestore: ModelStaticMethodDecorator = decorate.forHook('beforeBulkRestore');

/**
 * Registers the decorated static method as an `afterBulkRestore` hook of the model (like `Model.afterBulkRestore`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterBulkRestore
 *   static async onAfterBulkRestore(options: unknown) {}
 * }
 * ```
 */
export const AfterBulkRestore: ModelStaticMethodDecorator = decorate.forHook('afterBulkRestore');

/**
 * Registers the decorated static method as a `beforeFind` hook of the model (like `Model.beforeFind`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeFind
 *   static async onBeforeFind(options: unknown) {}
 * }
 * ```
 */
export const BeforeFind: ModelStaticMethodDecorator = decorate.forHook('beforeFind');

/**
 * Registers the decorated static method as a `beforeFindAfterExpandIncludeAll` hook of the model (like `Model.beforeFindAfterExpandIncludeAll`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeFindAfterExpandIncludeAll
 *   static async onBeforeFindAfterExpandIncludeAll(options: unknown) {}
 * }
 * ```
 */
export const BeforeFindAfterExpandIncludeAll: ModelStaticMethodDecorator = decorate.forHook(
  'beforeFindAfterExpandIncludeAll',
);

/**
 * Registers the decorated static method as a `beforeFindAfterOptions` hook of the model (like `Model.beforeFindAfterOptions`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeFindAfterOptions
 *   static async onBeforeFindAfterOptions(options: unknown) {}
 * }
 * ```
 */
export const BeforeFindAfterOptions: ModelStaticMethodDecorator =
  decorate.forHook('beforeFindAfterOptions');

/**
 * Registers the decorated static method as an `afterFind` hook of the model (like `Model.afterFind`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @AfterFind
 *   static async onAfterFind(result: unknown, options: unknown) {}
 * }
 * ```
 */
export const AfterFind: ModelStaticMethodDecorator = decorate.forHook('afterFind');

/**
 * Registers the decorated static method as a `beforeCount` hook of the model (like `Model.beforeCount`).
 * The method receives the hook arguments; static methods only. Registered when `sequelize.addModels` applies the class.
 * Accepts the TC39 and the legacy `experimentalDecorators` call signature.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   @BeforeCount
 *   static async onBeforeCount(options: unknown) {}
 * }
 * ```
 */
export const BeforeCount: ModelStaticMethodDecorator = decorate.forHook('beforeCount');
