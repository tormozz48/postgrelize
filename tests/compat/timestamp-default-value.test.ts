import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

const year = (value: unknown): number => (value as Date).getUTCFullYear();
const stamps = (row: Model): unknown => [year(row.get('createdAt')), year(row.get('updatedAt'))];

describe('compat: timestamps declared with a defaultValue', () => {
  it('uses the declared values on create, bulkCreate, save, update and upsert', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DATE, INTEGER } = lib.DataTypes;
      const Item = sequelize.define('Item', {
        id: { type: INTEGER, primaryKey: true, autoIncrement: true },
        n: INTEGER,
        createdAt: { type: DATE, defaultValue: new Date(Date.UTC(2012, 5, 1)) },
        updatedAt: { type: DATE, defaultValue: new Date(Date.UTC(2013, 5, 1)) },
      });
      await sequelize.sync({ force: true });
      const created = await Item.create({ n: 1 });
      await Item.bulkCreate([{ n: 2 }]);
      const seen: unknown[] = [stamps(created)];
      await created.update({ n: 3 });
      seen.push(stamps(created));
      await Item.update({ n: 4 }, { where: { n: 2 } });
      await Item.upsert({ id: 10, n: 5 });
      seen.push((await Item.findAll({ order: [['id', 'ASC']] })).map(stamps));
      return seen;
    }));
});
