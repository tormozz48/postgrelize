import { DataTypes, Op, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region define
  const address = DataTypes.COMPOSITE('address', {
    street: DataTypes.TEXT,
    zip: DataTypes.INTEGER,
    verified: DataTypes.BOOLEAN,
  });
  await sequelize.query(address.createSql());

  const Customer = sequelize.define(
    'Customer',
    { name: DataTypes.STRING, home: address },
    { timestamps: false },
  );
  await sequelize.sync();
  // #endregion define

  // #region use
  await Customer.create({
    name: 'ann',
    home: { street: 'Main St, 1', zip: 12345, verified: true },
  });

  const found = await Customer.findOne({
    where: { home: { [Op.eq]: { street: 'Main St, 1', zip: 12345, verified: true } } },
  });
  // #endregion use

  const home = found?.get('home') as { zip: number; street: string } | undefined;
  if (home?.zip !== 12345 || home.street !== 'Main St, 1') {
    throw new Error('unexpected result');
  }
};
