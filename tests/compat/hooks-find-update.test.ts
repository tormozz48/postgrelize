import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';
import type { Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const define = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('User', { name: lib.DataTypes.STRING, n: lib.DataTypes.INTEGER });

describe('compat: hooks around find and update', () => {
  it('afterFind of findOne receives the instance and its changes are returned', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = define(lib, sequelize);
      await sequelize.sync({ force: true });
      await User.create({ name: 'adam', n: 1 });
      const seen: string[] = [];
      User.afterFind((result: unknown) => {
        seen.push(Array.isArray(result) ? 'array' : result === null ? 'null' : 'instance');
        if (!Array.isArray(result) && result !== null) {
          (result as { name: string }).name = 'changed';
        }
      });
      const one = await User.findOne({ where: { name: 'adam' } });
      const none = await User.findOne({ where: { name: 'nobody' } });
      const all = await User.findAll();
      return { seen, one: one?.get('name'), none, all: all.map((row) => row.get('name')) };
    }));

  it('update with individualHooks returns the instances and applies the changes of beforeUpdate', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = define(lib, sequelize);
      await sequelize.sync({ force: true });
      await User.bulkCreate([{ n: 1 }, { n: 1 }, { n: 1 }]);
      User.beforeUpdate((user: { set(key: string, value: unknown): void }) =>
        user.set('name', 'hooked'),
      );
      const [count, rows] = (await User.update(
        { n: 10 },
        { where: { n: 1 }, individualHooks: true },
      )) as unknown as [number, unknown[]];
      const stored = await User.findAll({ order: [['id', 'ASC']] });
      return {
        count,
        rows: (rows as { get(key: string): unknown }[]).map((row) => [
          row.get('n'),
          row.get('name'),
        ]),
        stored: stored.map((row) => [row.get('n'), row.get('name')]),
      };
    }));

  it('update with individualHooks saves the rows one by one when the hooks change them differently', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = define(lib, sequelize);
      await sequelize.sync({ force: true });
      await User.bulkCreate([{ n: 1 }, { n: 1 }, { n: 1 }]);
      User.beforeUpdate(
        (user: { get(key: string): number; set(key: string, value: unknown): void }) => {
          if (user.get('id') === 1) user.set('n', user.get('n') + 3);
        },
      );
      const [count, rows] = (await User.update(
        { n: 10 },
        { where: { n: 1 }, individualHooks: true },
      )) as unknown as [number, unknown[]];
      return {
        count,
        rows: (rows as { get(key: string): unknown }[]).map((row) => row.get('n')).toSorted(),
        stored: (await User.findAll({ order: [['id', 'ASC']] })).map((row) => row.get('n')),
      };
    }));
});
