import { DataTypes, col, type Sequelize } from 'postgrelize';

export const minimumServerVersion = 170000;

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Stock = sequelize.define(
    'Stock',
    {
      sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
      qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
    },
    { timestamps: false },
  );
  await sequelize.sync();
  await Stock.bulkCreate([
    { sku: 'a', qty: 1 },
    { sku: 'b', qty: 2 },
  ]);

  // #region merge-returning
  const { rows } = await Stock.merge({
    source: [
      { sku: 'a', qty: 3 },
      { sku: 'n', qty: 9 },
    ],
    on: { sku: col('source.sku') },
    whenMatched: { update: { qty: col('source.qty') } },
    whenNotMatched: { insert: true },
    whenNotMatchedBySource: { update: { status: 'retired' } },
    returning: true,
  });
  const actions = rows.map(({ action, instance }) => `${action} ${String(instance.get('sku'))}`);
  // actions (in any order): 'UPDATE a', 'INSERT n', 'UPDATE b' (b is retired)
  // #endregion merge-returning

  if (actions.toSorted().join(',') !== 'INSERT n,UPDATE a,UPDATE b') {
    throw new Error(`merge-returning example: unexpected result ${actions.join(',')}`);
  }
};
