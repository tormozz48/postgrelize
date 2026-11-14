import { DataTypes, Deferrable, UniqueConstraintError, type Sequelize } from 'postgrelize';
import type { QueryInterface } from 'postgrelize';

// #region migration
export const up = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.createTable('accounts', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.TEXT, allowNull: false, unique: true },
    plan: { type: DataTypes.ENUM('free', 'pro'), allowNull: false, defaultValue: 'free' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.createTable('sessions', {
    id: { type: DataTypes.UUID, primaryKey: true },
    account_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'accounts', key: 'id', deferrable: Deferrable.INITIALLY_DEFERRED },
      onDelete: 'CASCADE',
    },
  });
  await queryInterface.addIndex('sessions', ['account_id']);
  await queryInterface.addColumn('accounts', 'note', { type: DataTypes.TEXT });
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.dropTable('sessions');
  await queryInterface.dropTable('accounts');
  await queryInterface.dropEnum('enum_accounts_plan');
};
// #endregion migration

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region sync
  const Device = sequelize.define(
    'Device',
    {
      serial: { type: DataTypes.TEXT, unique: { name: 'devices_serial', nullsNotDistinct: true } },
      vendor: DataTypes.TEXT,
      model: DataTypes.TEXT,
    },
    {
      indexes: [
        { fields: ['vendor', 'model'], unique: true, nullsNotDistinct: true },
        { fields: ['model'], where: { vendor: null } },
      ],
    },
  );
  await sequelize.sync();
  // #endregion sync

  // #region alter
  sequelize.define(
    'Device',
    {
      serial: { type: DataTypes.TEXT, unique: { name: 'devices_serial', nullsNotDistinct: true } },
      vendor: DataTypes.TEXT,
      model: DataTypes.TEXT,
      firmware: { type: DataTypes.TEXT, allowNull: false, defaultValue: '1.0' },
    },
    { indexes: [{ fields: ['vendor', 'model'], unique: true, nullsNotDistinct: true }] },
  );
  await sequelize.sync({ alter: true });
  // #endregion alter

  await Device.create({ serial: null, vendor: 'acme', model: null });
  const duplicate = await Device.create({ serial: null, vendor: 'other', model: 'x' }).catch(
    (error: unknown) => error,
  );

  // #region query-interface
  const queryInterface = sequelize.getQueryInterface();
  await up(queryInterface);
  const tables = await queryInterface.showAllTables();
  const accounts = await queryInterface.describeTable('accounts');
  await down(queryInterface);
  // #endregion query-interface

  const columns = Object.keys(await queryInterface.describeTable('Devices'));
  if (
    !(duplicate instanceof UniqueConstraintError) ||
    !columns.includes('firmware') ||
    tables.join(',') !== 'Devices,accounts,sessions' ||
    JSON.stringify(accounts['plan']?.special) !== '["free","pro"]' ||
    !('note' in accounts) ||
    (await queryInterface.showAllTables()).join(',') !== 'Devices'
  ) {
    throw new Error('schema example: unexpected result');
  }
};
