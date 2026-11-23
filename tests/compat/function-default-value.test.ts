import { it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

it('a function defaultValue is called once per new row, also in sync, build and bulkCreate', () =>
  expectSameResult('', async (lib, sequelize) => {
    let calls = 0;
    const Item = sequelize.define(
      'Item',
      {
        name: lib.DataTypes.STRING,
        color: { type: lib.DataTypes.STRING, defaultValue: () => `#${++calls}` },
      },
      { timestamps: false },
    );
    const ddl: string[] = [];
    await sequelize.sync({ force: true, logging: (sql: string) => ddl.push(sql) });
    const built = [Item.build({}), Item.build({})].map((row) => row.get('color'));
    const created = await Item.create({ name: 'a' });
    const bulk = await Item.bulkCreate([{ name: 'b' }, { name: 'c' }]);
    const [found] = await Item.findOrCreate({ where: { name: 'd' } });
    return {
      renderedDefault: ddl.some((sql) => /CREATE TABLE/.test(sql) && /DEFAULT/.test(sql)),
      built,
      created: created.get('color'),
      bulk: bulk.map((row) => row.get('color')),
      found: found.get('color'),
      stored: (await Item.findAll({ order: [['id', 'ASC']] })).map((row) => row.get('color')),
    };
  }));
