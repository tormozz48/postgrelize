import type { AnyModel } from './options.ts';

/**
 * Virtual getters of the `getterMethods` model option (Sequelize v6 `ModelGetterOptions`): read
 * through `instance.<name>`, `instance.get(name)` and `toJSON()`. An attribute's own `get` wins.
 *
 * @example
 * ```ts
 * const getterMethods: ModelGetterOptions = {
 *   label() {
 *     return `#${this.getDataValue('id')}`;
 *   },
 * };
 * sequelize.define('Item', {}, { getterMethods });
 * ```
 */
export interface ModelGetterOptions<M = AnyModel> {
  [name: string]: (this: M) => unknown;
}

/**
 * Virtual setters of the `setterMethods` model option (Sequelize v6 `ModelSetterOptions`): run when
 * `instance.<name>` or `instance.set(name, value)` is assigned. An attribute's own `set` wins.
 *
 * @example
 * ```ts
 * const setterMethods: ModelSetterOptions = {
 *   cost(value: number) {
 *     this.setDataValue('cents', value * 100);
 *   },
 * };
 * sequelize.define('Item', { cents: DataTypes.INTEGER }, { setterMethods });
 * ```
 */
export interface ModelSetterOptions<M = AnyModel> {
  // oxlint-disable-next-line typescript/no-explicit-any -- v6 types the assigned value as any
  [name: string]: (this: M, value: any) => void;
}
