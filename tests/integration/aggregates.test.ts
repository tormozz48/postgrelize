import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  arrayAgg,
  arraySlice,
  col,
  cube,
  fn,
  grouping,
  groupingSets,
  jsonbAgg,
  rollup,
  stringAgg,
  where,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Sale = sequelize.define(
    'Sale',
    {
      region: DataTypes.TEXT,
      product: DataTypes.TEXT,
      amount: DataTypes.INTEGER,
      soldOn: { type: DataTypes.INTEGER, field: 'sold_on' },
    },
    { timestamps: false },
  );
  return { sequelize, Sale };
};

const withData = <T>(run: (models: ReturnType<typeof setup>) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema }) => {
    const models = setup(schema);
    await models.sequelize.sync();
    await models.Sale.bulkCreate([
      { region: 'eu', product: 'a', amount: 1, soldOn: 1 },
      { region: 'eu', product: 'b', amount: 2, soldOn: 3 },
      { region: 'eu', product: 'a', amount: 4, soldOn: 2 },
      { region: 'eu', product: 'c', amount: 8, soldOn: null },
      { region: 'us', product: 'b', amount: 16, soldOn: 4 },
    ]);
    return run(models);
  });

const total = [fn('sum', col('amount')), 'total'] as const;

describe('ordered aggregates', () => {
  it('orders, deduplicates and slices inside findAll', () =>
    withData(async ({ Sale }) => {
      const recent = [['soldOn', 'DESC NULLS LAST']];
      const rows = await Sale.findAll({
        attributes: [
          'region',
          [arraySlice(arrayAgg<number>('id', { orderBy: recent }), 1, 3), 'latest'],
          [stringAgg('product', ', ', { distinct: true, orderBy: ['product'] }), 'products'],
          [jsonbAgg(col('amount'), { orderBy: [['amount', 'DESC']] }), 'amounts'],
        ],
        group: ['region'],
        order: ['region'],
        raw: true,
      });
      expect(rows).toEqual([
        { region: 'eu', latest: [2, 3, 1], products: 'a, b, c', amounts: [8, 4, 2, 1] },
        { region: 'us', latest: [5], products: 'b', amounts: [16] },
      ]);
    }));

  it('works as a subquery', () =>
    withData(async ({ Sale }) => {
      const ids = Sale.subquery({
        attributes: [[fn('unnest', arraySlice(arrayAgg('id', { orderBy: ['id'] }), 1, 1)), 'id']],
        group: ['region'],
      });
      const rows = await Sale.findAll({ where: { id: { [Op.in]: ids } }, order: ['id'] });
      expect(rows.map((row) => row.get('id'))).toEqual([1, 5]);
    }));
});

describe('grouping sets', () => {
  it('returns subtotals of GROUPING SETS built from a runtime list', () =>
    withData(async ({ Sale }) => {
      const dimensions = ['region', 'product'];
      const rows = await Sale.findAll({
        attributes: [...dimensions, [grouping(...dimensions), 'level'], total],
        group: [groupingSets([dimensions, ['region'], []])],
        order: [[grouping(...dimensions), 'ASC'], 'region', 'product'],
        raw: true,
      });
      expect(rows).toEqual([
        { region: 'eu', product: 'a', level: 0, total: '5' },
        { region: 'eu', product: 'b', level: 0, total: '2' },
        { region: 'eu', product: 'c', level: 0, total: '8' },
        { region: 'us', product: 'b', level: 0, total: '16' },
        { region: 'eu', product: null, level: 1, total: '15' },
        { region: 'us', product: null, level: 1, total: '16' },
        { region: null, product: null, level: 3, total: '31' },
      ]);
    }));

  it('runs ROLLUP and CUBE with HAVING GROUPING()', () =>
    withData(async ({ Sale }) => {
      const query = (group: unknown) =>
        Sale.findAll({
          attributes: ['region', 'product', total],
          group: group,
          raw: true,
        });
      expect(await query(rollup(['region', 'product']))).toHaveLength(7);
      expect(await query(cube(['region', 'product']))).toHaveLength(10);
      const subtotals = await Sale.findAll({
        attributes: ['region', total],
        group: [rollup(['region'])],
        having: where(grouping('region'), 1),
        raw: true,
      });
      expect(subtotals).toEqual([{ region: null, total: '31' }]);
    }));

  it('works in Model.subquery', () =>
    withData(async ({ Sale }) => {
      const totals = Sale.subquery({
        attributes: [total],
        group: [groupingSets([['region'], []])],
        having: where(grouping('region'), 1),
      });
      const rows = await Sale.findAll({ where: { amount: { [Op.lt]: totals } } });
      expect(rows).toHaveLength(5);
    }));
});
