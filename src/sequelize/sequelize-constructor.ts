import type { SequelizeBase } from './sequelize-base.ts';

/**
 * Constructor of `SequelizeBase` or a class derived from it; the base type of `Sequelize` mixins.
 *
 * @internal
 */
// oxlint-disable-next-line typescript/no-explicit-any -- TypeScript requires `any[]` in mixin constructor types.
export type SequelizeConstructor = new (...args: any[]) => SequelizeBase;
