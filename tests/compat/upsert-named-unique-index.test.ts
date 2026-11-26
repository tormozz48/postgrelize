import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: upsert with a unique index named by a string', () => {
  it('uses it as the conflict target', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const User = sequelize.define(
        'User',
        { name: STRING, address: STRING, city: STRING },
        { indexes: [{ unique: 'users_name_address' as never, fields: ['name', 'address'] }] },
      );
      await sequelize.sync({ force: true });
      await User.upsert({ name: 'u', address: 'a', city: 'one' });
      await User.upsert({ name: 'u', address: 'a', city: 'two' });
      await User.bulkCreate([{ name: 'u', address: 'a', city: 'three' }], {
        updateOnDuplicate: ['city'],
      });
      return (await User.findAll()).map((row) => [row.get('name'), row.get('city')]);
    }));
});
