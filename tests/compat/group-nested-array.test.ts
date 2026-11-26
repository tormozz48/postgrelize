import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: group items given as arrays', () => {
  it('groups by the column, not by a bound value', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Task = sequelize.define(
        'task',
        { userId: { type: INTEGER, field: 'user_id' } },
        { timestamps: false },
      );
      await Task.sync();
      await Task.bulkCreate([{ userId: 1 }, { userId: 1 }, { userId: 2 }]);
      const options = { attributes: ['userId'], group: [['userId']], order: [['userId', 'ASC']] };
      const rows = await Task.findAll(options as never);
      const counts = await Task.count({ group: [['userId']] } as never);
      return [rows.map((row) => row.toJSON()), counts];
    }));
});
