import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: Op.not with an array', () => {
  it('is NOT IN', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { Op } = lib;
      const Item = sequelize.define('Item', { name: lib.DataTypes.STRING });
      await sequelize.sync({ force: true });
      await Item.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
      const names = async (where: object): Promise<unknown> =>
        (await Item.findAll({ where: where as never, order: [['id', 'ASC']] })).map((row) =>
          row.get('name'),
        );
      return [
        await names({ id: { [Op.not]: [1] } }),
        await names({ name: { [Op.not]: ['a', 'c'] } }),
        await names({ id: { [Op.not]: [] } }),
        await names({ [Op.not]: [{ id: 1 }, { name: 'a' }] }),
      ];
    }));
});
