import { DataTypes, Sequelize } from 'postgrelize';

// #region pool
export const createPool = (url: string): Sequelize =>
  new Sequelize(url, {
    logging: false,
    // At most `max` statements run at once per Node.js process; extra calls wait for a connection.
    pool: { max: 10, idle: 10_000, acquire: 30_000 },
  });
// #endregion pool

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Reading = sequelize.define('Reading', {
    sensor: { type: DataTypes.TEXT, allowNull: false },
    value: DataTypes.INTEGER,
    note: DataTypes.TEXT,
  });
  await sequelize.sync();

  // #region bulk
  // One INSERT for all rows instead of one round trip per row.
  const rows = Array.from({ length: 500 }, (_, index) => ({
    sensor: `s${index % 5}`,
    value: index,
  }));
  await Reading.bulkCreate(rows, { validate: false });
  // #endregion bulk

  // #region read
  // Only the columns you need, as plain objects: no instances, no change tracking.
  const lean = await Reading.findAll({
    attributes: ['id', 'value'],
    where: { sensor: 's1' },
    limit: 100,
    raw: true,
  });
  // #endregion read

  // #region count
  // Aggregates and counts are computed by PostgreSQL; do not load rows to count them.
  const total = await Reading.count({ where: { sensor: 's1' } });
  // #endregion count

  if (lean.length !== 100 || total !== 100 || Object.keys(lean[0] ?? {}).length !== 2) {
    throw new Error('unexpected result');
  }
  const first = lean[0] as unknown as { id: number; value: number };
  if (first.value % 5 !== 1) {
    throw new Error('unexpected row');
  }
};
