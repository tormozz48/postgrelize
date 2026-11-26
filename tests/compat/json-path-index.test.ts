import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: array indexes in sequelize.json paths', () => {
  it('reads and filters array elements', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', { data: lib.DataTypes.JSONB });
      await sequelize.sync({ force: true });
      await Item.bulkCreate([
        { data: { phones: [1337, 42], list: [{ name: 'kate' }] } },
        { data: ['kate', 'joe'] },
      ]);
      const ids = async (where: unknown): Promise<unknown> =>
        (await Item.findAll({ where: where as never })).map((row) => row.get('id'));
      const found = await Item.findOne({
        where: { id: 1 },
        attributes: [[lib.json('data.phones[1]') as never, 'phone']],
        raw: true,
      });
      return [
        found,
        await ids(lib.json('data.0', 'kate')),
        await ids(lib.json('data.list[0].name', 'kate')),
        await ids(lib.json('data[1]', 'joe')),
      ];
    }));
});
