// #region imports
import { DataTypes, Model, Op, type Sequelize } from 'postgrelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'postgrelize';
// #endregion imports

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region model
  class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    declare id: CreationOptional<number>;
    declare email: string;
    declare active: CreationOptional<boolean>;
  }

  User.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { sequelize },
  );

  await sequelize.sync();
  // #endregion model

  // #region crud
  const ann = await User.create({ email: 'ann@example.com' });
  await User.bulkCreate([
    { email: 'bob@example.com' },
    { email: 'eve@example.com', active: false },
  ]);

  const active = await User.findAll({ where: { active: true }, order: [['email', 'ASC']] });
  const count = await User.count({ where: { email: { [Op.iLike]: '%@example.com' } } });

  ann.active = false;
  await ann.save();
  await User.destroy({ where: { active: false } });
  // #endregion crud

  if (active.length !== 2 || count !== 3 || (await User.count()) !== 1) {
    throw new Error('getting-started example: unexpected result');
  }
};
