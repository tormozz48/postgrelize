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

  // #region partitioning
  await queryInterface.createTable(
    'events',
    { at: DataTypes.DATE, kind: DataTypes.TEXT },
    { partitionBy: { strategy: 'range', columns: ['at'] } },
  );
  await queryInterface.createPartition('events', 'events_2026', {
    from: ['2026-01-01'],
    to: ['2027-01-01'],
  });
  await queryInterface.createPartition('events', 'events_other', { default: true });
  await queryInterface.createTable('events_2027', { at: DataTypes.DATE, kind: DataTypes.TEXT });
  await queryInterface.attachPartition('events', 'events_2027', {
    from: ['2027-01-01'],
    to: ['2028-01-01'],
  });
  await queryInterface.detachPartition('events', 'events_2026');
  // #endregion partitioning
  await sequelize.query("INSERT INTO events VALUES ('2027-05-01', 'x'), ('2030-01-01', 'y')");
  const [placed] = (await sequelize.query(
    "SELECT tableoid::regclass::text AS part FROM events WHERE kind = 'x'",
  )) as [{ part: string }[], unknown];
  await queryInterface.dropTable('events', { cascade: true });
  await queryInterface.dropTable('events_2026');
  if (!rejected || !overlap || !placed[0]?.part.endsWith('events_2027')) {
    throw new Error('constraints and indexes example: unexpected result');
  }
};
