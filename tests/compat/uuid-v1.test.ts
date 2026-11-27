import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('compat: DataTypes.UUIDV1', () => {
  it('generates a v1 UUID on build, create and bulkCreate', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        id: { type: lib.DataTypes.UUID, primaryKey: true, defaultValue: lib.DataTypes.UUIDV1 },
        other: { type: lib.DataTypes.STRING, defaultValue: lib.DataTypes.UUIDV1 },
      });
      await sequelize.sync();
      const rows = [Item.build(), await Item.create(), ...(await Item.bulkCreate([{}, {}]))];
      const ids = rows.flatMap((row) => [row.get('id'), row.get('other')]) as string[];
      return {
        valid: ids.map((id) => V1.test(id)),
        distinct: new Set(ids).size,
        stored: (await Item.findByPk(ids[2]))?.get('other') === ids[3],
        exported: [lib.UUIDV1 !== undefined, lib.Sequelize.UUIDV1 !== undefined],
      };
    }));
});
