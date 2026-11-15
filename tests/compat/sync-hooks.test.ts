import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

type Log = unknown[];

const define = (lib: Lib, sequelize: Sequelize, log: Log) => {
  const record = (name: string) => (options: { hooks?: boolean; force?: boolean }) => {
    log.push([name, options.hooks, options.force ?? null]);
  };
  const hooks = { beforeSync: record('beforeSync'), afterSync: record('afterSync') };
  sequelize.addHook('beforeBulkSync', record('beforeBulkSync'));
  sequelize.addHook('afterBulkSync', record('afterBulkSync'));
  const Owner = sequelize.define('Owner', { name: lib.DataTypes.STRING }, { hooks });
  const Pet = sequelize.define('Pet', { name: lib.DataTypes.STRING }, { hooks });
  Pet.belongsTo(Owner);
  return Owner;
};

describe('sync hooks match sequelize v6', () => {
  it('sequelize.sync() runs bulk and per-model hooks in order', () =>
    expectSameResult('', async (lib, sequelize) => {
      const log: Log = [];
      define(lib, sequelize, log);
      await sequelize.sync({ force: true });
      return log;
    }));

  it('sequelize.sync({ hooks: false }) runs no hooks', () =>
    expectSameResult('', async (lib, sequelize) => {
      const log: Log = [];
      define(lib, sequelize, log);
      await sequelize.sync({ hooks: false });
      return log;
    }));

  it('Model.sync() runs only the model hooks', () =>
    expectSameResult('', async (lib, sequelize) => {
      const log: Log = [];
      const Owner = define(lib, sequelize, log);
      await Owner.sync();
      return log;
    }));
});
