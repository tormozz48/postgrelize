import { afterEach, describe, expect, it } from 'vitest';
import {
  cast,
  col,
  DataTypes,
  literal,
  Op,
  Sequelize,
  type Model,
  type ModelStatic,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const OLD = new Date('2000-01-01T00:00:00Z');

const HOOKS = [
  'beforeBulkCreate',
  'afterBulkCreate',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeCreate',
  'beforeUpdate',
  'beforeDestroy',
  'beforeUpsert',
  'afterUpsert',
  'beforeValidate',
] as const;

const setup = async (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Item: ModelStatic<Model> = sequelize.define('Item', {
    sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
    qty: DataTypes.INTEGER,
  });
  await sequelize.sync();
  await Item.bulkCreate([{ sku: 'a', qty: 1 }], { silent: true });
  await Item.update({ updatedAt: OLD }, { where: { sku: 'a' }, silent: true });
  await sequelize.query(`UPDATE "Items" SET "updatedAt" = '${OLD.toISOString()}'`);
  const calls: string[] = [];
  HOOKS.forEach((name) => Item.addHook(name, () => void calls.push(name)));
  const row = async (sku: string) =>
    (await Item.findOne({ where: { sku }, raw: true })) as unknown as {
      qty: number;
      createdAt: Date;
      updatedAt: Date;
    };
  return { sequelize, Item, calls, row };
};

const keep = { target: ['sku'], action: { update: ['qty'] } } as const;

const unnest = (skus: readonly string[], quantities: readonly number[]) => ({
  function: 'unnest',
  args: [cast(skus, 'text[]'), cast(quantities, 'integer[]')],
  columns: ['sku', 'qty'],
});

describe('source relations', () => {
  it('inserts from unnest of bound arrays without reading the model table', () =>
    withSchema(async ({ schema }) => {
      const { Item, calls, row } = await setup(schema);
      const written = await Item.insertFrom(
        Item.subquery({
          source: unnest(['a', 'b'], [10, 20]),
          attributes: [
            'sku',
            'qty',
            [literal('now()'), 'createdAt'],
            [literal('now()'), 'updatedAt'],
          ],
        }),
        { columns: ['sku', 'qty', 'createdAt', 'updatedAt'], silent: true, onConflict: keep },
      );
      expect(written.map((item) => [item.get('sku'), item.wasInserted])).toEqual([
        ['a', false],
        ['b', true],
      ]);
      expect(await row('a')).toMatchObject({ qty: 10, updatedAt: OLD });
      expect(await Item.count()).toBe(2);
      expect(calls).toEqual([]);
    }));

  it('reads rows from a function or VALUES source in finders', () =>
    withSchema(async ({ schema }) => {
      const { Item } = await setup(schema);
      const fromFunction = await Item.findAll({
        attributes: ['sku', 'qty'],
        raw: true,
        source: unnest(['x', 'y'], [1, 2]),
        where: { qty: { [Op.gt]: 1 } },
      });
      expect(fromFunction).toEqual([{ sku: 'y', qty: 2 }]);
      const values = { columns: ['sku', 'qty'], rows: [['v', cast(3, 'integer')]] };
      expect(
        await Item.findAll({
          attributes: ['sku', [col('Item.qty'), 'qty']],
          raw: true,
          source: { values },
        }),
      ).toEqual([{ sku: 'v', qty: 3 }]);
      expect(await Item.count({ source: { values } })).toBe(1);
    }));
});
