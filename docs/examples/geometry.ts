import { DataTypes, Op, cast, literal, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region define
  const Place = sequelize.define(
    'Place',
    {
      name: DataTypes.STRING,
      at: DataTypes.POINT,
      area: DataTypes.BOX,
      route: DataTypes.PATH,
      zone: DataTypes.POLYGON,
      range: DataTypes.CIRCLE,
    },
    { timestamps: false },
  );
  await sequelize.sync();
  // #endregion define

  // #region use
  await Place.create({
    name: 'depot',
    at: { x: 1, y: 1 },
    area: [
      { x: 2, y: 2 },
      { x: 0, y: 0 },
    ],
    route: {
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    zone: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ],
    range: { x: 1, y: 1, radius: 5 },
  });

  const inside = await Place.count({ where: { area: { [Op.contains]: cast('(1,1)', 'point') } } });
  const near = await Place.count({ where: literal('"at" <-> point(0,0) < 2') });
  // #endregion use

  const place = await Place.findOne();
  const at = place?.get('at') as { x: number; y: number } | undefined;
  const range = place?.get('range') as { radius: number } | undefined;
  if (inside !== 1 || near !== 1 || at?.x !== 1 || range?.radius !== 5) {
    throw new Error('unexpected result');
  }
};
