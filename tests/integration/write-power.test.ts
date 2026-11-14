import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, col, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Stock = sequelize.define('Stock', {
    sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
    qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('active', 'retired'), defaultValue: 'active' },
  });
  const Delivery = sequelize.define(
    'Delivery',
    { sku: DataTypes.TEXT, amount: DataTypes.INTEGER },
    { timestamps: false },
  );
  const Archive = sequelize.define(
    'Archive',
    { sku: DataTypes.TEXT, qty: DataTypes.INTEGER },
    { timestamps: false },
  );
  await sequelize.sync();
  await Stock.bulkCreate([
    { sku: 'a', qty: 1 },
    { sku: 'b', qty: 2 },
    { sku: 'c', qty: 0 },
  ]);
  await Delivery.bulkCreate([
    { sku: 'a', amount: 10 },
    { sku: 'b', amount: 20 },
  ]);
  return { sequelize, Stock, Delivery, Archive };
};

const quantities = async (model: {
  findAll: (options: object) => Promise<Array<{ get: (key: string) => unknown }>>;
}) =>
  (await model.findAll({ order: [['sku', 'ASC']] })).map((row) => [
    row.get('sku'),
    row.get('qty'),
    row.get('status'),
  ]);

describe('UPDATE ... FROM / DELETE ... USING / INSERT ... SELECT', () => {
  it('updates from another table and deletes using another table', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Delivery } = await setup(schema);
      const [count] = await Stock.update(
        { qty: literal('"Stock"."qty" + "d"."amount"') },
        { where: { sku: col('d.sku') }, from: { d: Delivery } },
      );
      expect(count).toBe(2);
      expect(await quantities(Stock)).toEqual([
        ['a', 11, 'active'],
        ['b', 22, 'active'],
        ['c', 0, 'active'],
      ]);
      const removed = await Stock.destroy({
        where: { sku: col('d.sku'), qty: { [Op.gt]: 20 } },
        using: { d: Delivery },
      });
      expect(removed).toBe(1);
      expect(await Stock.count()).toBe(2);
    }));

  it('inserts rows from a subquery with onConflict', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Archive, Delivery } = await setup(schema);
      const archived = await Archive.insertFrom(
        Stock.subquery({
          attributes: ['sku', 'qty'],
          where: { qty: { [Op.gt]: 0 } },
          order: [['sku', 'ASC']],
        }),
        {
          columns: ['sku', 'qty'],
        },
      );
      expect(archived.map((row) => [row.get('sku'), row.get('qty'), row.wasInserted])).toEqual([
        ['a', 1, true],
        ['b', 2, true],
      ]);
      const upserted = await Stock.insertFrom(
        Delivery.subquery({
          attributes: [
            'sku',
            'amount',
            [literal('now()'), 'createdAt'],
            [literal('now()'), 'updatedAt'],
          ],
        }),
        {
          columns: ['sku', 'qty', 'createdAt', 'updatedAt'],
          onConflict: {
            target: ['sku'],
            action: { update: { qty: literal('"Stock"."qty" + EXCLUDED."qty"') } },
          },
        },
      );
      expect(upserted.map((row) => [row.get('sku'), row.get('qty'), row.wasInserted])).toEqual([
        ['a', 11, false],
        ['b', 22, false],
      ]);
    }));
});

describe('MERGE', () => {
  it('merges value rows: update matched, insert new, delete by condition', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      const result = await Stock.merge({
        source: [
          { sku: 'a', qty: 5, status: 'active' },
          { sku: 'c', qty: -1, status: 'active' },
          { sku: 'z', qty: 7, status: 'retired' },
        ],
        on: { sku: col('source.sku') },
        whenMatched: [
          { where: literal('"source"."qty" < 0'), delete: true },
          { update: { qty: literal('"Stock"."qty" + "source"."qty"') } },
        ],
        whenNotMatched: { insert: true },
      });
      expect(result.rowCount).toBe(3);
      expect(await quantities(Stock)).toEqual([
        ['a', 6, 'active'],
        ['b', 2, 'active'],
        ['z', 7, 'retired'],
      ]);
    }));

  it('merges from a subquery source', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Delivery } = await setup(schema);
      await Stock.merge({
        source: Delivery.subquery({ attributes: ['sku', 'amount'] }),
        as: 'd',
        on: { sku: col('d.sku') },
        whenMatched: { update: { qty: col('d.amount') } },
      });
      expect(await quantities(Stock)).toEqual([
        ['a', 10, 'active'],
        ['b', 20, 'active'],
        ['c', 0, 'active'],
      ]);
    }));

  it('returns actions and handles NOT MATCHED BY SOURCE on PostgreSQL 17+', () =>
    withSchema(async ({ schema }) => {
      const { Stock, sequelize } = await setup(schema);
      const version = Number(
        (
          (await sequelize.query('SHOW server_version_num', { type: 'SELECT', plain: true })) as {
            server_version_num: string;
          }
        ).server_version_num,
      );
      const run = () =>
        Stock.merge({
          source: [{ sku: 'a', qty: 3 }],
          on: { sku: col('source.sku') },
          whenMatched: { update: { qty: col('source.qty') } },
          whenNotMatchedBySource: { update: { status: 'retired' } },
          returning: true,
        });
      const outcome =
        version < 170000
          ? await run().then(
              () => 'resolved',
              (error: Error) =>
                /PostgreSQL 17/.test(error.message) ? 'requires PostgreSQL 17' : error.message,
            )
          : (await run()).rows
              .map((row) => [row.action, row.instance.get('sku'), row.instance.get('status')])
              .toSorted();
      expect(outcome).toEqual(
        version < 170000
          ? 'requires PostgreSQL 17'
          : [
              ['UPDATE', 'a', 'active'],
              ['UPDATE', 'b', 'retired'],
              ['UPDATE', 'c', 'retired'],
            ],
      );
    }));

  it('validates merge options', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.merge({ source: [], on: { sku: col('source.sku') }, whenMatched: { delete: true } }),
      ).rejects.toThrow(/must not be empty/);
      await expect(
        Stock.merge({ source: [{ sku: 'a' }], on: { sku: col('source.sku') } }),
      ).rejects.toThrow(/at least one WHEN/);
    }));
});
