import type { Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();

  // #region extension
  await queryInterface.createExtension('pg_trgm', { ifNotExists: true });
  // #endregion extension

  // #region sequence
  await queryInterface.createSequence('invoice_number', { start: 1000, increment: 1 });
  const first = await queryInterface.nextval('invoice_number');
  await queryInterface.setval('invoice_number', 5000);
  const afterSet = await queryInterface.nextval('invoice_number');
  await queryInterface.alterSequence('invoice_number', { restartWith: 1, cycle: false });
  await queryInterface.dropSequence('invoice_number');
  // #endregion sequence

  await queryInterface.dropExtension('pg_trgm');
  if (first !== '1000' || afterSet !== '5001') {
    throw new Error('schema objects example: unexpected result');
  }
};
