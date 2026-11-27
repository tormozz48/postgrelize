import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: VIRTUAL getters and selected attributes', () => {
  it('omits the virtual attributes a finder did not select', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        name: lib.DataTypes.STRING,
        shout: { type: lib.DataTypes.VIRTUAL, get: () => 'SHOUT' },
        other: { type: lib.DataTypes.VIRTUAL, get: () => 1 },
      });
      await sequelize.sync();
      await Item.create({ name: 'a' });
      const keys = async (options: object) =>
        Object.keys((await Item.findOne(options))?.get() as object).toSorted();
      return [
        await keys({}),
        await keys({ attributes: { exclude: ['shout'] } }),
        await keys({ attributes: ['id', 'name'] }),
        await keys({ attributes: ['id', 'shout'] }),
        await keys({ attributes: { include: [['name', 'alias']] } }),
        Object.keys(Item.build().get() as object).includes('shout'),
      ];
    }));
});
