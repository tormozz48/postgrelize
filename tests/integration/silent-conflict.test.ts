import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  excluded,
  literal,
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

describe('silent on conflict updates', () => {
  const writes: [string, (item: ModelStatic<Model>, silent: boolean) => Promise<unknown>][] = [
    ['upsert', (item, silent) => item.upsert({ sku: 'a', qty: 5 }, { hooks: false, silent })],
    [
      'upsert with onConflict',
      (item, silent) =>
        item.upsert({ sku: 'a', qty: 5 }, { hooks: false, silent, onConflict: keep }),
    ],
    [
      'insert',
      (item, silent) =>
        item.insert({ sku: 'a', qty: 5 }, { hooks: false, silent, onConflict: keep }),
    ],
    [
      'create',
      (item, silent) =>
        item.create({ sku: 'a', qty: 5 }, { hooks: false, silent, onConflict: keep }),
    ],
    [
      'bulkCreate',
      (item, silent) =>
        item.bulkCreate([{ sku: 'a', qty: 5 }], { hooks: false, silent, onConflict: keep }),
    ],
    [
      'insertFrom',
      (item, silent) =>
        item.insertFrom(
          item.subquery({
            attributes: [
              'sku',
              [literal('5'), 'qty'],
              'createdAt',
              [literal('now()'), 'updatedAt'],
            ],
          }),
          { columns: ['sku', 'qty', 'createdAt', 'updatedAt'], silent, onConflict: keep },
        ),
    ],
  ];

  it.each(writes)('%s keeps updatedAt only when silent, without hooks', (_name, write) =>
    withSchema(async ({ schema }) => {
      const { Item, calls, row } = await setup(schema);
      await write(Item, true);
      expect(await row('a')).toMatchObject({ qty: 5, updatedAt: OLD });
      await write(Item, false);
      expect((await row('a')).updatedAt.getTime()).toBeGreaterThan(OLD.getTime());
      expect(calls).toEqual([]);
    }),
  );

  it('still stamps a new row and an updatedAt that the caller names', () =>
    withSchema(async ({ schema }) => {
      const { Item, row } = await setup(schema);
      await Item.upsert({ sku: 'new', qty: 1 }, { silent: true });
      expect((await row('new')).updatedAt).toBeInstanceOf(Date);
      const stamp = new Date('2010-01-01T00:00:00Z');
      await Item.insert(
        { sku: 'a', qty: 2 },
        {
          silent: true,
          onConflict: {
            target: ['sku'],
            action: { update: { qty: excluded('qty'), updatedAt: stamp } },
          },
        },
      );
      expect((await row('a')).updatedAt).toEqual(stamp);
    }));
});
