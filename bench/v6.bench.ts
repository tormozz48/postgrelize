// Sequelize v6 adapter for the benchmark: the same scenarios (bench/scenarios.ts) run on v6 so every
// case reports a postgrelize/v6 ratio. Loaded by bench/orm.bench.ts; not a standalone entry point.
import * as sequelizeV6 from 'sequelize';
import type { Lib } from './scenarios.ts';

export const v6Lib: Lib = {
  Sequelize: sequelizeV6.Sequelize,
  DataTypes: sequelizeV6.DataTypes,
  Op: sequelizeV6.Op,
};
