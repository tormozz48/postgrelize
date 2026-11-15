import type { ScopeOptions } from '../model/scope-registry.ts';
import { decorate } from './decorator-factory.ts';
import type { ModelClassDecorator } from './decorator-types.ts';
import type { ScopesInput, TableOptions } from './model-metadata.ts';

/**
 * Marks a class as a model and sets its table options: everything `Model.init` accepts except
 * `sequelize`. Optional; a decorated class without `@Table` gets the `Model.init` defaults.
 *
 * Use it bare (`@Table`) or called. The class must be registered with `sequelize.addModels`.
 *
 * @param options - Table options (`tableName`, `schema`, `timestamps`, `paranoid`, `indexes`, `hooks`, …).
 * @returns A class decorator.
 * @example
 * ```ts
 * @Table({ tableName: 'users', paranoid: true })
 * class User extends Model {}
 * ```
 * @see {@link Sequelize.addModels}
 */
export const Table = decorate.optionalClass<TableOptions>((options) =>
  decorate.forClass((meta) => Object.assign(meta.table, options)),
);

/**
 * Sets the default scope of a model (`defaultScope` of `Model.init`).
 *
 * @param scope - Scope options, or a function returning them (evaluated by `addModels`, so it may refer to other models).
 * @returns A class decorator.
 * @example
 * ```ts
 * @DefaultScope(() => ({ where: { active: true } }))
 * class User extends Model {}
 * ```
 */
export const DefaultScope = (scope: ScopeOptions | (() => ScopeOptions)): ModelClassDecorator =>
  decorate.forClass((meta) => {
    meta.defaultScope = scope;
  });

/**
 * Defines the named scopes of a model (`scopes` of `Model.init`).
 *
 * @param scopes - Scopes by name (options or functions returning options), or a function returning them.
 * @returns A class decorator.
 * @example
 * ```ts
 * @Scopes({ recent: { order: [['createdAt', 'DESC']] }, named: (name: string) => ({ where: { name } }) })
 * class User extends Model {}
 * ```
 */
export const Scopes = (scopes: ScopesInput | (() => ScopesInput)): ModelClassDecorator =>
  decorate.forClass((meta) => {
    meta.scopes = scopes;
  });
