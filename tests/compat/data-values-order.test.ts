import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: key order of dataValues', () => {
  it('puts defaults of missing attributes first and given values in their own order', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'User',
        {
          username: lib.DataTypes.STRING,
          age: lib.DataTypes.INTEGER,
          isUser: { type: lib.DataTypes.BOOLEAN, defaultValue: false },
          isAdmin: { type: lib.DataTypes.BOOLEAN, defaultValue: false },
        },
        { timestamps: false },
      );
      await sequelize.sync({ force: true });
      const given = { username: 'u', age: 9, isAdmin: true, isUser: false };
      const created = await User.create({ ...given });
      return [
        JSON.stringify(User.build({ ...given })),
        JSON.stringify(User.build({ age: 1 })),
        JSON.stringify(User.build({ id: 7, username: undefined, isAdmin: null } as never)),
        Object.keys(User.build({ isAdmin: true }).dataValues as object),
        JSON.stringify(created),
        created.changed(),
        User.build({ isUser: false }).changed(),
      ];
    }));
});
