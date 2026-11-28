import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: Op.any of a column', () => {
  it('compares with the elements of an array column', async () => {
    await expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        code: lib.DataTypes.INTEGER,
        codes: lib.DataTypes.ARRAY(lib.DataTypes.INTEGER),
      });
      await sequelize.sync();
      await Item.bulkCreate([
        { code: 1, codes: [1, 2] },
        { code: 3, codes: [4] },
      ]);
      const rows = await Item.findAll({
        where: { code: { [lib.Op.any]: lib.col('codes') } },
        order: [['id', 'ASC']],
      });
      return rows.map((row) => row.get('code'));
    });
  });
});
