import { DataTypes, col, fn, where, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const [available] = (await sequelize.query(
    "SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'",
  )) as [unknown[], unknown];
  if (available.length === 0) {
    return;
  }
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis');

  // #region define
  const Place = sequelize.define(
    'Place',
    {
      name: DataTypes.STRING,
      location: DataTypes.GEOMETRY('POINT', 4326),
      region: DataTypes.GEOGRAPHY('POLYGON', 4326),
    },
    { timestamps: false },
  );
  await sequelize.sync();
  // #endregion define

  // #region use
  await Place.create({
    name: 'Kyiv',
    location: { type: 'Point', coordinates: [30.52, 50.45] },
    region: {
      type: 'Polygon',
      coordinates: [
        [
          [30, 50],
          [31, 50],
          [31, 51],
          [30, 50],
        ],
      ],
    },
  });

  const nearby = await Place.findAll({
    where: where(
      fn(
        'ST_DWithin',
        col('location'),
        fn('ST_SetSRID', fn('ST_MakePoint', 30.5, 50.4), 4326),
        0.2,
      ),
      true,
    ),
  });
  // #endregion use

  const location = nearby[0]?.get('location') as { coordinates: number[] } | undefined;
  if (nearby.length !== 1 || location?.coordinates[0] !== 30.52) {
    throw new Error('unexpected result');
  }
};
