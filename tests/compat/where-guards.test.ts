import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const message = (run: () => Promise<unknown>): Promise<string> =>
  Promise.resolve()
    .then(run)
    .then(
      () => 'fulfilled',
      (error: Error) => `${error.name}: ${error.message}`,
    );

describe('compat: guards against writes and reads without a usable where', () => {
  it('update, destroy and restore require a where, and an undefined value is rejected', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', { name: lib.DataTypes.STRING }, { paranoid: true });
      await sequelize.sync({ force: true });
      await User.create({ name: 'a' });
      const result = {
        updateNoWhere: await message(() => User.update({ name: 'x' }, {} as never)),
        destroyNoWhere: await message(() => User.destroy({} as never)),
        restoreNoWhere: await message(() => User.restore({} as never)),
        updateUndefined: await message(() =>
          User.update({ name: 'x' }, { where: { name: undefined } }),
        ),
        destroyUndefined: await message(() => User.destroy({ where: { name: undefined } })),
        findUndefined: await message(() => User.findAll({ where: { name: undefined } })),
        countUndefined: await message(() => User.count({ where: { name: undefined } })),
      };
      // nothing above changed a row, and an empty where object is still allowed
      return {
        ...result,
        rows: await User.count(),
        emptyWhereUpdate: await message(() => User.update({ name: 'b' }, { where: {} })),
        truncate: await message(() => User.destroy({ truncate: true } as never)),
      };
    }));

  it('an ENUM without values is rejected when the model is defined', () =>
    expectSameResult('', async (lib, sequelize) => {
      return {
        called: await message(async () =>
          sequelize.define('E', { m: { type: lib.DataTypes.ENUM } } as never),
        ),
        bare: await message(async () => sequelize.define('E2', { m: lib.DataTypes.ENUM } as never)),
        withValues: await message(async () =>
          sequelize.define('E3', { m: { type: lib.DataTypes.ENUM, values: ['a'] } } as never),
        ),
      };
    }));
});
