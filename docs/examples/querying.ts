import { DataTypes, Op, QueryTypes, fn, col, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Item = sequelize.define(
    'Item',
    {
      code: DataTypes.TEXT,
      qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      attrs: DataTypes.JSONB,
      tags: DataTypes.ARRAY(DataTypes.TEXT),
    },
    {
      scopes: {
        inStock: { where: { qty: { [Op.gt]: 0 } } },
        tagged: (tag: string) => ({ where: { tags: { [Op.contains]: [tag] } } }),
      },
    },
  );
  await sequelize.sync();
  await Item.bulkCreate([
    { code: 'a', qty: 1, attrs: { color: 'red', size: 1 }, tags: ['new'] },
    { code: null, qty: 2, attrs: { color: 'blue' }, tags: [] },
    { code: 'c', qty: 0, attrs: null, tags: ['new', 'sale'] },
  ]);

  // #region where
  const red = await Item.findAll({ where: { 'attrs.color': 'red' } });
  const big = await Item.findAll({
    where: { [Op.or]: [{ qty: { [Op.gte]: 2 } }, { code: { [Op.iLike]: 'A%' } }] },
    order: [['qty', 'DESC']],
  });
  const withSize = await Item.count({ where: { attrs: { [Op.hasKey]: 'size' } } });
  const notA = await Item.count({ where: { code: { [Op.isDistinctFrom]: 'a' } } });
  const listed = await Item.count({ where: { id: { [Op.any]: [1, 3] } } });
  // #endregion where

  // #region pagination
  const { count, rows } = await Item.findAndCountAll({
    attributes: ['id', 'code'],
    order: [['id', 'ASC']],
    limit: 2,
    offset: 1,
  });
  // #endregion pagination

  // #region aggregates
  const total = await Item.sum('qty');
  const maxQty = await Item.max('qty');
  const perTag = await Item.findAll({
    attributes: [
      [fn('unnest', col('tags')), 'tag'],
      [fn('count', col('id')), 'n'],
    ],
    group: ['tag'],
    order: [['tag', 'ASC']],
    raw: true,
  });
  await Item.increment('qty', { by: 5, where: { code: 'c' } });
  // #endregion aggregates

  // #region scopes
  const onSale = await Item.scope('inStock', { method: ['tagged', 'sale'] }).findAll();
  // #endregion scopes

  // #region raw
  const byReplacement = (await sequelize.query('SELECT code FROM "Items" WHERE qty > :min', {
    replacements: { min: 1 },
    type: QueryTypes.SELECT,
  })) as { code: string }[];
  const byBind = (await sequelize.query('SELECT code FROM "Items" WHERE code = $1', {
    bind: ['a'],
    type: QueryTypes.SELECT,
  })) as { code: string }[];
  // #endregion raw

  const expected = JSON.stringify([
    [1, 2, 1, 2, 2, 3, 2, 3, 2, 1, 2, 1],
    [
      { tag: 'new', n: '2' },
      { tag: 'sale', n: '1' },
    ],
  ]);
  const actual = JSON.stringify([
    [
      red.length,
      big.length,
      withSize,
      notA,
      listed,
      count,
      rows.length,
      total,
      maxQty,
      onSale.length,
      byReplacement.length,
      byBind.length,
    ],
    perTag,
  ]);
  if (actual !== expected) {
    throw new Error(`querying example: unexpected result ${actual}`);
  }
};
