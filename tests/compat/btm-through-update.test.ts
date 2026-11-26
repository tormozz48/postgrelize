import { describe, it } from 'vitest';
import type { Model, Transaction } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

type Linker = Record<'addUsers' | 'addUser' | 'setUsers', (...args: unknown[]) => Promise<unknown>>;

describe('compat: through values of existing belongsToMany rows', () => {
  it('add and set update them, also inside a transaction', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', {});
      const Task = sequelize.define('Task', {});
      const UserTask = sequelize.define('UserTask', {
        status: lib.DataTypes.STRING,
        note: lib.DataTypes.STRING,
      });
      Task.belongsToMany(User, { through: UserTask });
      User.belongsToMany(Task, { through: UserTask });
      await sequelize.sync({ force: true });
      const task = (await Task.create()) as Model & Linker;
      const [one, two] = [await User.create(), await User.create()];
      const rows = async (transaction?: Transaction): Promise<unknown> =>
        (
          await UserTask.findAll({
            order: [['UserId', 'ASC']],
            ...(transaction && { transaction }),
          })
        ).map((row) => [row.get('UserId'), row.get('status'), row.get('note')]);
      const seen: unknown[] = [];
      await task.addUser(one, { through: { status: 'pending', note: 'n' } });
      await task.addUser(one, { through: { status: 'done' } });
      seen.push(await rows());
      (one as unknown as Record<string, unknown>)['UserTask'] = { note: 'own' };
      await task.addUsers([one, two], { through: { status: 'both' } });
      seen.push(await rows());
      await task.setUsers([two], { through: { status: 'set' } });
      seen.push(await rows());
      await sequelize.transaction(async (transaction) => {
        await task.addUser(two, { through: { status: 'tx' }, transaction });
        seen.push(await rows(transaction));
      });
      return seen;
    }));
});
