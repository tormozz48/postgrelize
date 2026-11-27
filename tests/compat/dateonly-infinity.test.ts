import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: Infinity in DATEONLY and DATE', () => {
  it.each(['DATEONLY', 'DATE'] as const)(
    'syncs infinite %s defaults and reads them back',
    async (type) => {
      await expectSameResult('', async (lib, sequelize) => {
        const Item = sequelize.define('Item', {
          before: { type: lib.DataTypes[type], defaultValue: -Infinity },
          after: { type: lib.DataTypes[type], defaultValue: Infinity },
          given: lib.DataTypes[type],
        });
        await sequelize.sync();
        const created = await Item.create({ given: Infinity } as never);
        await created.update({ given: -Infinity } as never);
        const read = await Item.findByPk(created.get('id') as number);
        const values = (row: typeof read) =>
          ['before', 'after', 'given'].map((name) => String(row?.get(name)));
        const assigned = Item.build({ given: 'Infinity' } as never).get('given');
        const [raw] = await sequelize.query(`SELECT 'infinity'::date AS d, DATE '2026-01-02' AS e`);
        return [values(created), values(read), String(assigned), raw];
      });
    },
  );
});
