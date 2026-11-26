import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: cast suffix of a nested JSON where key', () => {
  it('casts the value and rejects an unknown cast type', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { Op, DataTypes } = lib;
      const Item = sequelize.define('Item', { data: DataTypes.JSONB });
      await sequelize.sync({ force: true });
      await Item.bulkCreate([
        { data: { level: 5, nested: { n: 5 } } },
        { data: { level: 10, nested: { n: 10 } } },
        { data: { level: 2, nested: { n: 2 } } },
      ]);
      const levels = async (where: object): Promise<unknown> =>
        Item.findAll({ where: where as never, order: [['id', 'ASC']] }).then(
          (rows) => rows.map((row) => row.get('id')),
          (error: Error) => error.message,
        );
      return [
        await levels({ data: { 'level::integer': { [Op.gt]: 3 } } }),
        await levels({ data: { nested: { 'n::integer': 10 } } }),
        await levels({ data: { 'level::integer) OR 1=1 --': 1 } }),
        await levels({ data: { 'level::regclass': 1 } }),
      ];
    }));
});
