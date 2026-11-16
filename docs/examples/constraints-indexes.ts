import { DataTypes, Op, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable('accounts', { email: DataTypes.TEXT, nick: DataTypes.TEXT });

  // #region expression-index
  await queryInterface.addIndex('accounts', {
    name: 'accounts_lower_email',
    unique: true,
    fields: [{ expression: 'lower(email)' }],
    include: ['nick'],
  });
  await queryInterface.addIndex('accounts', {
    name: 'accounts_nick_search',
    fields: [
      { name: 'nick', collate: 'C', operator: 'text_pattern_ops', order: 'DESC', nulls: 'LAST' },
    ],
  });
  // #endregion expression-index

  await queryInterface.createExtension('btree_gist', { ifNotExists: true });
  await queryInterface.createTable('bookings', {
    room: DataTypes.INTEGER,
    period: DataTypes.RANGE(DataTypes.INTEGER),
  });
  // #region exclude
  await queryInterface.addConstraint('bookings', {
    type: 'exclude',
    name: 'bookings_no_overlap',
    using: 'gist',
    exclude: [
      { name: 'room', with: '=' },
      { name: 'period', with: '&&' },
    ],
  });
  // #endregion exclude
  await sequelize.query("INSERT INTO bookings VALUES (1, '[1,5)')");
  let overlap = false;
  try {
    await sequelize.query("INSERT INTO bookings VALUES (1, '[4,8)')");
  } catch {
    overlap = true;
  }
  await queryInterface.dropTable('bookings');

  await queryInterface.createTable('products', { price: DataTypes.INTEGER });
  await sequelize.query('INSERT INTO products (price) VALUES (-1)');
  // #region not-valid
  await queryInterface.addConstraint('products', {
    type: 'check',
    fields: ['price'],
    name: 'products_price_positive',
    where: { price: { [Op.gt]: 0 } },
    notValid: true,
  });
  await sequelize.query('UPDATE products SET price = 1');
  await queryInterface.validateConstraint('products', 'products_price_positive');
  // #endregion not-valid
  await queryInterface.dropTable('products');

  await sequelize.query("INSERT INTO accounts (email) VALUES ('A@x.io')");
  let rejected = false;
  try {
    await sequelize.query("INSERT INTO accounts (email) VALUES ('a@X.io')");
  } catch {
    rejected = true;
  }
  await queryInterface.dropTable('accounts');
  if (!rejected || !overlap) {
    throw new Error('constraints and indexes example: unexpected result');
  }
};
