import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Loose = Record<string, unknown>;

describe('compat: primaryKeyField and rawAttributes of instances', () => {
  it('exposes them like v6', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        pk: { type: lib.DataTypes.INTEGER, primaryKey: true, field: 'pk_f' },
        name: lib.DataTypes.STRING,
      });
      const built = Item.build({ pk: 1 }) as unknown as { rawAttributes: Loose };
      const Owner = sequelize.define('Owner', {});
      Owner.hasMany(Item);
      await sequelize.sync({ force: true });
      const owner = (await Owner.create()) as unknown as {
        countItems: (options: object) => Promise<number>;
      };
      await Item.bulkCreate([
        { pk: 1, name: 'a', OwnerId: 1 },
        { pk: 2, name: 'a', OwnerId: 1 },
      ] as never);
      return [
        await owner.countItems({ group: ['name'], attributes: ['name'] }),
        (Item as unknown as Loose)['primaryKeyField'],
        Object.keys(built.rawAttributes),
      ];
    }));
});
