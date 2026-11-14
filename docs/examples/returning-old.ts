import { DataTypes, excluded, literal, type Sequelize } from 'postgrelize';

export const minimumServerVersion = 180000;

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Stock = sequelize.define(
    'Stock',
    {
      sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
      qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { timestamps: false },
  );
  await sequelize.sync();
  await Stock.bulkCreate([
    { sku: 'a', qty: 1 },
    { sku: 'b', qty: 2 },
  ]);

  // #region update
  const [, changed = []] = await Stock.update(
    { qty: literal('qty + 10') },
    { where: { sku: 'a' }, returning: true, returningOld: true },
  );
  const [stock] = changed;
  // stock.get('qty') === 11, stock.oldValues === { id: 1, sku: 'a', qty: 1 }
  // #endregion update

  // #region upsert
  const written = await Stock.insert(
    [
      { sku: 'b', qty: 5 },
      { sku: 'z', qty: 7 },
    ],
    {
      onConflict: { target: ['sku'], action: { update: { qty: excluded('qty') } } },
      returningOld: true,
    },
  );
  const previous = written.map((row) => row.oldValues?.['qty'] ?? null);
  // previous: [2, null] — 'b' was updated from 2, 'z' was inserted
  // #endregion upsert

  if (
    stock?.get('qty') !== 11 ||
    stock.oldValues?.['qty'] !== 1 ||
    JSON.stringify(previous) !== '[2,null]'
  ) {
    throw new Error('returning-old example: unexpected result');
  }
};
