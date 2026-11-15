import { DataTypes, Op, literal, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS hstore');
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS ltree');

  // #region define
  const Asset = sequelize.define(
    'Asset',
    {
      attrs: DataTypes.HSTORE,
      path: DataTypes.LTREE,
      price: DataTypes.MONEY,
      mac: DataTypes.MACADDR8,
      manifest: DataTypes.XML,
      flags: DataTypes.BIT(4),
      mask: DataTypes.VARBIT(16),
      filter: DataTypes.TSQUERY,
      seenAt: DataTypes.TIMESTAMP,
    },
    { timestamps: false },
  );
  await sequelize.sync();
  // #endregion define

  // #region use
  await Asset.create({
    attrs: { color: 'red', note: null },
    path: 'Top.Science.Astronomy',
    price: 12.5,
    mac: '08:00:2b:01:02:03:04:05',
    manifest: '<asset><id>1</id></asset>',
    flags: '1010',
    mask: '101',
    filter: "'fat' & 'rat'",
    seenAt: new Date(2024, 0, 2, 3, 4, 5),
  });

  const found = await Asset.findOne({ where: { attrs: { [Op.contains]: { color: 'red' } } } });
  const descendants = await Asset.count({ where: literal("path <@ 'Top.Science'") });
  // #endregion use

  const attrs = found?.get('attrs') as Record<string, string | null> | undefined;
  if (attrs?.['color'] !== 'red' || attrs['note'] !== null || descendants !== 1) {
    throw new Error('unexpected result');
  }
};
