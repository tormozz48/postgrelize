import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Row = { get: (key: string) => unknown };

const read = (item: Row): unknown => [item.get('code'), item.get('made')];

describe('compat: literal() defaultValue', () => {
  it('is returned by create, save, upsert and bulkCreate', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER } = lib.DataTypes;
      const Item = sequelize.define('Item', {
        name: { type: STRING, primaryKey: true },
        code: { type: INTEGER, defaultValue: lib.literal(2020 as never) },
        made: { type: INTEGER, defaultValue: lib.fn('length', 'abc') },
      });
      await sequelize.sync({ force: true });
      const created = await Item.create({ name: 'a' });
      const saved = await Item.build({ name: 'b' }).save();
      const [upserted] = await Item.upsert({ name: 'c' }, { returning: true });
      const bulk = await Item.bulkCreate([{ name: 'd' }, { name: 'e', code: 1 }]);
      return [read(created), read(saved), read(upserted), bulk.map(read)];
    }));
});
