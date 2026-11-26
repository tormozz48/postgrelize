import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: attribute named like an instance method', () => {
  it('keeps the method and the value', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const Item = sequelize.define('item', { set: STRING, where: STRING, changed: STRING });
      await Item.sync();
      const item = Item.build({ set: 'a', where: 'b', changed: 'c' });
      item.set('set', 'd');
      await item.save();
      const found = await Item.findOne();
      return [
        typeof item.set,
        typeof item.where,
        typeof item.changed,
        found!.get('set'),
        found!.get('where'),
        found!.get('changed'),
      ];
    }));
});
