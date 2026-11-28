import {
  DataTypes,
  Op,
  arrayAgg,
  arraySlice,
  col,
  fn,
  grouping,
  groupingSets,
  jsonbAgg,
  rollup,
  stringAgg,
  where,
  type ExpressionResult,
  type Sequelize,
} from 'postgrelize';

const expectEqual = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected result: ${JSON.stringify(actual)}`);
  }
};

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Order = sequelize.define(
    'Order',
    { region: DataTypes.TEXT, item: DataTypes.TEXT, amount: DataTypes.INTEGER },
    { timestamps: false },
  );
  await sequelize.sync();
  await Order.bulkCreate([
    { region: 'eu', item: 'pen', amount: 1 },
    { region: 'eu', item: 'ink', amount: 5 },
    { region: 'eu', item: 'pen', amount: 3 },
    { region: 'us', item: 'ink', amount: 2 },
  ]);

  // #region ordered
  // (array_agg("Order"."id" ORDER BY "Order"."amount" DESC NULLS LAST))[1:2]
  const largest = arraySlice(
    arrayAgg<number>('id', { orderBy: [['amount', 'DESC NULLS LAST']] }),
    1,
    2,
  );
  const items = stringAgg('item', ', ', { distinct: true, orderBy: ['item'] });
  const amounts = jsonbAgg<number>('amount', { orderBy: ['amount'] });

  type Summary = {
    region: string;
    largest: ExpressionResult<typeof largest>; // number[] | null
    items: ExpressionResult<typeof items>; // string | null
    amounts: ExpressionResult<typeof amounts>; // number[] | null
  };
  const summary = (await Order.findAll({
    attributes: ['region', [largest, 'largest'], [items, 'items'], [amounts, 'amounts']],
    group: ['region'],
    order: ['region'],
    raw: true,
  })) as unknown as Summary[];
  // eu: largest [2, 3], items 'ink, pen', amounts [1, 3, 5]
  // #endregion ordered

  // #region grouping-sets
  const dimensions = ['region', 'item']; // may be built at run time
  const report = await Order.findAll({
    attributes: [
      ...dimensions,
      [grouping(...dimensions), 'level'],
      [fn('sum', col('amount')), 'total'],
    ],
    // GROUPING SETS (("Order"."region", "Order"."item"), ("Order"."region"), ())
    group: [groupingSets([dimensions, ['region'], []])],
    order: [[grouping(...dimensions), 'ASC'], 'region', 'item'],
    raw: true,
  });
  // level 0: rows per region and item, 1: subtotal per region, 3: grand total

  // only the subtotal rows of ROLLUP ("region"), as a subquery
  const grandTotal = Order.subquery({
    attributes: [[fn('sum', col('amount')), 'total']],
    group: [rollup(['region'])],
    having: where(grouping('region'), 1),
  });
  const small = await Order.count({ where: { amount: { [Op.lt]: grandTotal } } });
  // #endregion grouping-sets

  expectEqual(summary[0], {
    region: 'eu',
    largest: [2, 3],
    items: 'ink, pen',
    amounts: [1, 3, 5],
  });
  expectEqual([report.length, small], [6, 4]);
};
