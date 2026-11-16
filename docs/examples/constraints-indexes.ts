import { DataTypes, type Sequelize } from 'postgrelize';

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

  await sequelize.query("INSERT INTO accounts (email) VALUES ('A@x.io')");
  let rejected = false;
  try {
    await sequelize.query("INSERT INTO accounts (email) VALUES ('a@X.io')");
  } catch {
    rejected = true;
  }
  await queryInterface.dropTable('accounts');
  if (!rejected) {
    throw new Error('constraints and indexes example: expression index did not enforce uniqueness');
  }
};
