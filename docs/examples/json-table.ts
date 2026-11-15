import { DataTypes, col, type Sequelize } from 'postgrelize';

export const minimumServerVersion = 170000;

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Product = sequelize.define('Product', { sku: DataTypes.TEXT }, { timestamps: false });
  await sequelize.sync();
  await Product.bulkCreate([{ sku: 'a' }, { sku: 'b' }]);

  // #region json-table
  const rows = await Product.findAll({
    attributes: ['sku', [col('item.qty'), 'qty'], [col('item.position'), 'position']],
    from: {
      item: {
        jsonTable: {
          doc: {
            items: [
              { sku: 'a', qty: 5 },
              { sku: 'b', qty: 9 },
            ],
          },
          path: '$.items[*]',
          columns: [
            { name: 'position', ordinality: true },
            { name: 'sku', type: 'text' },
            { name: 'qty', type: 'integer' },
          ],
        },
      },
    },
    where: { sku: col('item.sku') },
    order: [['sku', 'ASC']],
    raw: true,
  });
  // rows: a → qty 5, position 1; b → qty 9, position 2
  // #endregion json-table

  const actual = JSON.stringify(rows);
  const expected = JSON.stringify([
    { sku: 'a', qty: 5, position: 1 },
    { sku: 'b', qty: 9, position: 2 },
  ]);
  if (actual !== expected) {
    throw new Error(`json-table example: unexpected result ${actual}`);
  }
};
