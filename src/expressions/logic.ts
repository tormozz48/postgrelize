import type { WhereOptions } from '../model/where-options.ts';
import { Op } from './op.ts';

/**
 * Combines conditions with `AND` (Sequelize v6 `and`), for use inside `where`.
 *
 * @param conditions - Conditions to combine.
 * @returns A `{ [Op.and]: conditions }` condition usable as `where`.
 *
 * @example
 * ```ts
 * await User.findAll({ where: and({ age: { [Op.gt]: 18 } }, { active: true }) });
 * ```
 */
export const and = (...conditions: readonly WhereOptions[]): WhereOptions => ({
  [Op.and]: conditions,
});

/**
 * Combines conditions with `OR` (Sequelize v6 `or`), for use inside `where`.
 *
 * @param conditions - Conditions to combine.
 * @returns A `{ [Op.or]: conditions }` condition usable as `where`.
 *
 * @example
 * ```ts
 * await User.findAll({ where: or({ role: 'admin' }, { role: 'owner' }) });
 * ```
 */
export const or = (...conditions: readonly WhereOptions[]): WhereOptions => ({
  [Op.or]: conditions,
});
