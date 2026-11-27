import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type * as postgrelize from '../../src/index.ts';

// the schema name is shared by every database, but each compat file has its own database
const define = async (lib: Lib, sequelize: postgrelize.Sequelize) => {
  const Shop = sequelize.define('Shop', { name: lib.DataTypes.STRING });
  const Employee = sequelize.define('Employee', { name: lib.DataTypes.STRING });
  Shop.hasMany(Employee, { as: 'staff', foreignKey: 'shopId' });
  Employee.belongsTo(Shop, { as: 'shop', foreignKey: 'shopId' });
  await sequelize.query('CREATE SCHEMA IF NOT EXISTS clone_one');
  const ShopOne = Shop.schema('clone_one');
  const EmployeeOne = Employee.schema('clone_one');
  await ShopOne.sync({ force: true });
  await EmployeeOne.sync({ force: true });
  const shop = (await ShopOne.create({ name: 's' } as never)) as Model;
  await EmployeeOne.create({ name: 'e', shopId: shop.get('id') } as never);
  return { Shop, ShopOne, EmployeeOne };
};

describe('compat: include of schema-bound model copies', () => {
  it('reads both sides from the schema', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { ShopOne, EmployeeOne } = await define(lib, sequelize);
      const found = await ShopOne.findAll({ include: [{ model: EmployeeOne, as: 'staff' }] });
      const back = await EmployeeOne.findAll({ include: [{ model: ShopOne, as: 'shop' }] });
      return [found, back].map((rows) => rows.map((row) => row.toJSON()));
    }));
});

describe('compat: sync into a schema', () => {
  it('keeps references and association accessors in the schema', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', { name: lib.DataTypes.STRING });
      const Task = sequelize.define('Task', { title: lib.DataTypes.STRING });
      Task.belongsTo(User);
      await sequelize.query('CREATE SCHEMA IF NOT EXISTS clone_sync');
      await User.sync({ force: true, schema: 'clone_sync' });
      await Task.sync({ force: true, schema: 'clone_sync' });
      const user = await User.schema('clone_sync').create({ name: 'u' } as never);
      const task = (await Task.schema('clone_sync').create({ title: 't' } as never)) as Model & {
        setUser(user: Model): Promise<unknown>;
        getUser(options: object): Promise<Model | null>;
      };
      await task.setUser(user);
      return (await task.getUser({ schema: 'clone_sync' }))?.get('name');
    }));
});
