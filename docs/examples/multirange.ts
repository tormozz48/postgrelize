import { DataTypes, Op, cast, type Sequelize } from 'postgrelize';

export const minimumServerVersion = 14;

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region define
  const Shift = sequelize.define(
    'Shift',
    {
      worker: DataTypes.STRING,
      hours: DataTypes.MULTIRANGE(DataTypes.INTEGER),
    },
    { timestamps: false },
  );
  await sequelize.sync();
  // #endregion define

  // #region use
  await Shift.create({
    worker: 'ann',
    hours: [
      [8, 12],
      [13, 17],
    ],
  });
  await Shift.create({ worker: 'bob', hours: [[18, 22]] });

  const working = await Shift.findAll({
    where: { hours: { [Op.contains]: cast('9', 'int4') } },
  });
  const evening = await Shift.count({ where: { hours: { [Op.overlap]: [[20, 24]] } } });
  // #endregion use

  const hours = working[0]?.get('hours') as { value: number }[][] | undefined;
  if (working.length !== 1 || evening !== 1 || hours?.[1]?.[0]?.value !== 13) {
    throw new Error('unexpected result');
  }
};
