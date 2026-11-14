import { DataTypes, Op, col, literal, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region models
  const Stock = sequelize.define('Stock', {
    sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
    qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
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
  // #endregion models

  // #region update-from
  const [updated] = await Stock.update(
    { qty: literal('"Stock"."qty" + "d"."amount"') },
    { where: { sku: col('d.sku') }, from: { d: Delivery } },
  );
  // UPDATE "Stocks" AS "Stock" SET ... FROM "Deliveries" AS "d" WHERE "Stock"."sku" = "d"."sku"
  // #endregion update-from

  // #region insert-from
  const archived = await Archive.insertFrom(
    Stock.subquery({ attributes: ['sku', 'qty'], where: { qty: { [Op.gt]: 20 } } }),
    { columns: ['sku', 'qty'] },
  );
  // #endregion insert-from

  // #region destroy-using
  const removed = await Stock.destroy({
    where: { sku: col('a.sku') },
    using: { a: Archive },
  });
  // #endregion destroy-using

  // #region merge
  const merged = await Stock.merge({
    source: [
      { sku: 'a', qty: 5 },
      { sku: 'c', qty: -1 },
      { sku: 'z', qty: 7 },
    ],
    on: { sku: col('source.sku') },
    whenMatched: [
      { where: literal('"source"."qty" < 0'), delete: true },
      { update: { qty: literal('"Stock"."qty" + "source"."qty"') } },
    ],
    whenNotMatched: { insert: true },
  });
  // merged.rowCount === 3: 'a' updated, 'c' deleted, 'z' inserted
  // #endregion merge

  // #region merge-subquery
  await Stock.merge({
    source: Delivery.subquery({ attributes: ['sku', 'amount'] }),
    as: 'd',
    on: { sku: col('d.sku') },
    whenMatched: { update: { qty: col('d.amount') } },
    whenNotMatched: { insert: { sku: col('d.sku'), qty: col('d.amount') } },
  });
  // #endregion merge-subquery

  const stock = (await Stock.findAll({ order: [['sku', 'ASC']] })).map(
    (row) => `${String(row.get('sku'))}:${String(row.get('qty'))}`,
  );
  if (
    updated !== 2 ||
    archived.length !== 1 ||
    archived[0]?.get('sku') !== 'b' ||
    removed !== 1 ||
    merged.rowCount !== 3 ||
    stock.join(',') !== 'a:10,b:20,z:7'
  ) {
    throw new Error(`bulk-writes example: unexpected result ${stock.join(',')}`);
  }
};
