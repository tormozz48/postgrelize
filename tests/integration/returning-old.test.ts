import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize, col, excluded, literal } from '../../src/index.ts';
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
  const Stock = sequelize.define(
    'Stock',
    {
      sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
      qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      seenAt: { type: DataTypes.DATE, field: 'seen_at' },
    },
    { timestamps: false },
  );
  await sequelize.sync();
  await Stock.bulkCreate([
    { sku: 'a', qty: 1, seenAt: new Date('2026-01-01T00:00:00Z') },
    { sku: 'b', qty: 2 },
  ]);
  const version = Number(
    (
      (await sequelize.query('SHOW server_version_num', { type: 'SELECT', plain: true })) as {
        server_version_num: string;
      }
    ).server_version_num,
  );
  return { sequelize, Stock, version };
};

const pick = (instance: { get: (key: string) => unknown; oldValues: unknown }) => [
  instance.get('sku'),
  instance.get('qty'),
  instance.oldValues === null
    ? null
    : (({ sku, qty, seenAt }: Record<string, unknown>) => ({ sku, qty, seenAt }))(
        instance.oldValues as Record<string, unknown>,
      ),
];

type StockModel = Awaited<ReturnType<typeof setup>>['Stock'];

const writeAll = async (Stock: StockModel) => {
  const [count, updated = []] = await Stock.update(
    { qty: literal('qty + 10') },
    { where: { sku: 'a' }, returning: true, returningOld: true },
  );
  const upserted = await Stock.insert(
    [
      { sku: 'b', qty: 5 },
      { sku: 'z', qty: 7 },
    ],
    {
      onConflict: { target: ['sku'], action: { update: { qty: excluded('qty') } } },
      returningOld: true,
    },
  );
  const copied = await Stock.insertFrom(
    Stock.subquery({ attributes: [[literal(`'z'`), 'sku'], 'qty'], where: { sku: 'a' } }),
    {
      columns: ['sku', 'qty'],
      onConflict: { target: ['sku'], action: { update: { qty: excluded('qty') } } },
      returningOld: true,
    },
  );
  const merged = await Stock.merge({
    source: [
      { sku: 'a', qty: 0 },
      { sku: 'n', qty: 3 },
    ],
    on: { sku: col('source.sku') },
    whenMatched: { delete: true },
    whenNotMatched: { insert: true },
    returning: true,
    returningOld: true,
  });
  return {
    count,
    updated: updated.map(pick),
    upserted: upserted.map((row) => [row.wasInserted, ...pick(row)]),
    copied: copied.map(pick),
    merged: merged.rows.map((row) => [row.action, ...pick(row.instance)]).toSorted(),
  };
};

const seen = new Date('2026-01-01T00:00:00Z');

describe('returningOld (PostgreSQL 18+)', () => {
  it('returns pre-statement values for update, upsert, insertFrom and merge', () =>
    withSchema(async ({ schema }) => {
      const { Stock, version } = await setup(schema);
      const outcome =
        version < 180000
          ? await writeAll(Stock).then(
              () => 'resolved',
              (error: Error) => error.message,
            )
          : await writeAll(Stock);
      expect(outcome).toEqual(
        version < 180000
          ? 'returningOld requires PostgreSQL 18 or newer'
          : {
              count: 1,
              updated: [['a', 11, { sku: 'a', qty: 1, seenAt: seen }]],
              upserted: [
                [false, 'b', 5, { sku: 'b', qty: 2, seenAt: null }],
                [true, 'z', 7, null],
              ],
              copied: [['z', 11, { sku: 'z', qty: 7, seenAt: null }]],
              merged: [
                ['DELETE', 'a', 11, { sku: 'a', qty: 11, seenAt: seen }],
                ['INSERT', 'n', 3, null],
              ],
            },
      );
    }));

  it('rejects returningOld without returning', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.update({ qty: 1 }, { where: { sku: 'a' }, returningOld: true }),
      ).rejects.toThrow('update: returningOld requires returning: true');
    }));
});
