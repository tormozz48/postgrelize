import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: read-only attributes of instances', () => {
  it('set and update keep the primary key and the timestamps of a persisted record', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define(
        'Item',
        { name: lib.DataTypes.STRING },
        { paranoid: true, version: true },
      );
      await sequelize.sync({ force: true });
      const past = new Date(Date.UTC(2000, 0, 1));
      const built = Item.build({ id: 5, createdAt: past });
      built.set('id', 6);
      const fresh = [built.get('id'), (built.get('createdAt') as Date).getUTCFullYear()];
      const item = await Item.create({ name: 'a' });
      item.set({ id: 100, createdAt: past, updatedAt: past, deletedAt: past, version: 9 });
      const changed = item.changed();
      await item.update({ id: 200, createdAt: past, name: 'b' });
      await item.reload();
      const unsaved = Item.build({ id: 7 }, { isNewRecord: false });
      unsaved.set({ id: 8 });
      return {
        fresh,
        changed,
        stored: [
          item.get('id'),
          item.get('name'),
          (item.get('createdAt') as Date).getUTCFullYear() === 2000,
          item.get('deletedAt'),
          item.get('version'),
        ],
        unsaved: unsaved.get('id'),
      };
    }));
});
