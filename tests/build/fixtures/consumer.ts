import {
  DataTypes,
  Model,
  Sequelize,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from '../../../dist/index.js';
class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
}
const sequelize = new Sequelize('postgres://x');
User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: DataTypes.STRING,
  },
  { sequelize },
);
export const run = async (): Promise<string> => {
  const users = await User.findAll({ where: { name: 'a' } });
  const user = await User.create({ name: 'b' });
  user.set('name', 'c');
  await user.save();
  await User.merge({ source: [{ name: 'x' }], on: {}, whenNotMatched: { insert: true } });
  return users[0]?.get('name') ?? user.name;
};
