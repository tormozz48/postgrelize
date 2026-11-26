import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: increment / decrement with optimistic locking', () => {
  it('raises the version on both', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Item = sequelize.define(
        'Item',
        { a: { type: INTEGER, defaultValue: 0 } },
        { version: 'rev' },
      );
      await sequelize.sync({ force: true });
      const item = await Item.create();
      await Item.increment('a', { where: {} });
      await Item.decrement('a', { by: 2, where: {} });
      await item.increment('a', { by: 5 });
      await item.reload();
      return [item.get('a'), item.get('rev')];
    }));
});
