// Compile-time checks run by `npm run typecheck`: Sequelize v6 typing patterns must compile.
import {
  DataTypes,
  Model,
  Op,
  Sequelize,
  type CreationAttributes,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from '../../src/index.ts';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare age: number | null;
  declare fullName: NonAttribute<string>;
}

const sequelize = new Sequelize('postgres://localhost/db', { logging: false });

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, allowNull: false },
    age: DataTypes.INTEGER,
  },
  { sequelize },
);

export const typeChecks = async (): Promise<void> => {
  const created: User = await User.create({ email: 'a@b.c', age: null });
  const id: number = created.id;
  const found: User | null = await User.findOne({
    where: { email: { [Op.iLike]: 'a%' }, age: { [Op.gt]: 1 } },
  });
  const sure: User = await User.findOne({ where: { id }, rejectOnEmpty: true });
  const all: User[] = await User.findAll({
    where: { [Op.or]: [{ age: null }, { email: ['x', 'y'] }] },
  });
  const count: number = await User.count({ where: { age: { [Op.between]: [1, 2] } } });
  const [affected]: [number, User[]?] = await User.update({ age: 3 }, { where: { id: 1 } });
  const values: CreationAttributes<User> = { email: 'x' };
  // @ts-expect-error unknown attribute in where
  await User.findAll({ where: { nope: 1 } });
  // @ts-expect-error wrong attribute type on create
  await User.create({ email: 1 });
  // @ts-expect-error NonAttribute is not an attribute
  const fullName: InferAttributes<User>['fullName'] = '';
  void [found, sure, all, count, affected, values, fullName];
};
