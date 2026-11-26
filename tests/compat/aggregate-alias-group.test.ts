import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: aggregate with attributes', () => {
  it('groups by an aliased attribute', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Item = sequelize.define('item', { kind: INTEGER }, { timestamps: false });
      await Item.sync();
      await Item.bulkCreate([{ kind: 2 }, { kind: 2 }, { kind: 1 }]);
      const options = { attributes: [['kind', 'k']], group: ['k'], order: [['kind', 'DESC']] };
      return [
        await Item.aggregate('id', 'count', {
          attributes: [['kind', 'k']],
          group: ['k'],
          order: [['k', 'DESC']],
        } as never),
        await Item.aggregate('id', 'max', {
          attributes: options.attributes,
          group: ['k'],
        } as never),
      ];
    }));
});
