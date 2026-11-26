import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: scope function selected by name', () => {
  it('is called without arguments', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const User = sequelize.define(
        'user',
        { age: INTEGER },
        { timestamps: false, scopes: { old: (min?: number) => ({ where: { age: min ?? 40 } }) } },
      );
      await User.sync();
      await User.bulkCreate([{ age: 30 }, { age: 40 }]);
      const rows = await User.scope('old').findAll();
      return [rows.map((row) => row.get('age')), await User.scope('old').count()];
    }));
});
