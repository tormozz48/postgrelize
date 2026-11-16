import { DataTypes, Op, type Sequelize } from 'postgrelize';

export const minimumServerVersion = 180000;

export const run = async (sequelize: Sequelize): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createExtension('btree_gist', { ifNotExists: true });
  await queryInterface.createTable('rooms', {
    id: DataTypes.INTEGER,
    validAt: DataTypes.RANGE(DataTypes.DATE),
  });
  await queryInterface.createTable('stays', {
    roomId: DataTypes.INTEGER,
    during: DataTypes.RANGE(DataTypes.DATE),
    nights: DataTypes.INTEGER,
  });

  // #region temporal
  await queryInterface.addConstraint('rooms', {
    type: 'primary key',
    name: 'rooms_pk',
    fields: ['id', 'validAt'],
    withoutOverlaps: true,
  });
  await queryInterface.addConstraint('stays', {
    type: 'foreign key',
    name: 'stays_room_fk',
    fields: ['roomId', 'during'],
    period: true,
    references: { table: 'rooms', field: 'id', fields: ['id', 'validAt'] },
  });
  // #endregion temporal

  // #region not-enforced
  await queryInterface.addConstraint('stays', {
    type: 'check',
    name: 'stays_nights_positive',
    fields: ['nights'],
    where: { nights: { [Op.gt]: 0 } },
    enforced: false,
  });
  // #endregion not-enforced

  await sequelize.query(
    `INSERT INTO rooms VALUES (1, tstzrange('2026-01-01', '2027-01-01')), (2, tstzrange('2026-01-01', '2027-01-01'))`,
  );
  await sequelize.query(`INSERT INTO stays VALUES (1, tstzrange('2026-02-01', '2026-03-01'), -3)`);
  let rejected = false;
  try {
    await sequelize.query(`INSERT INTO stays VALUES (1, tstzrange('2026-02-01', '2028-01-01'), 3)`);
  } catch {
    rejected = true;
  }
  await queryInterface.dropTable('stays');
  await queryInterface.dropTable('rooms');
  if (!rejected) {
    throw new Error('constraints and indexes pg18 example: unexpected result');
  }
};
