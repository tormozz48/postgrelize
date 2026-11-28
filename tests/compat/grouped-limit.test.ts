import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

type Many = Model & Record<string, (items: unknown) => Promise<unknown>>;

// PostgreSQL does not order the junction rows of one instance
const junctionOrder = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([name, value]) => [
      name,
      Array.isArray(value)
        ? value.toSorted((a, b) => a.projectId - b.projectId || a.id - b.id)
        : value,
    ]),
  );

const setup = async (lib: Lib, sequelize: Sequelize) => {
  const User = sequelize.define('user', { age: lib.DataTypes.INTEGER });
  const Project = sequelize.define('project', {});
  const Task = sequelize.define('task', {});
  const Membership = sequelize.define('membership', {}, { paranoid: true });
  const projects = User.belongsToMany(Project, { through: 'project_user' });
  Project.belongsToMany(User, { as: 'members', through: 'project_user' });
  const paranoid = User.belongsToMany(Project, { as: 'active', through: Membership });
  Project.belongsToMany(User, { as: 'activeMembers', through: Membership });
  const tasks = User.hasMany(Task);
  await sequelize.sync({ force: true });
  const users = (await User.bulkCreate(
    [-5, 45, 7, -9, 8].map((age) => ({ age })) as never,
  )) as Many[];
  const [first, second] = (await Project.bulkCreate([{}, {}] as never)) as Many[];
  await first!['setMembers']!(users.slice(0, 4));
  await second!['setMembers']!(users.slice(2));
  await first!['setActiveMembers']!(users.slice(0, 2));
  await second!['setActiveMembers']!(users.slice(4));
  await Membership.destroy({ where: { userId: 1 } });
  await Task.bulkCreate([1, 2, 2, 2, 3].map((userId) => ({ userId })) as never);
  const find = async (model: unknown, options: object): Promise<unknown[]> =>
    (await (model as typeof User).findAll(options as never)).map((row) =>
      junctionOrder(row.toJSON() as never),
    );
  return { User, Task, projects, paranoid, tasks, find };
};

describe('compat: findAll with groupedLimit', () => {
  it('limits the rows of each value of a hasMany association or an attribute', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { Task, tasks, find } = await setup(lib, sequelize);
      const order = [['id', 'DESC']];
      return [
        await find(Task, { order, groupedLimit: { limit: 2, on: tasks, values: [1, 2, 3] } }),
        await find(Task, { order, groupedLimit: { limit: 1, on: 'userId', values: [2, 3] } }),
        await find(Task, {
          order,
          where: { id: [1, 2, 5] },
          groupedLimit: { limit: 2, on: tasks, values: [2, 3] },
        }),
      ];
    }));

  it('limits the rows of each target of a belongsToMany association', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { User, projects, paranoid, tasks, find } = await setup(lib, sequelize);
      const groupedLimit = { limit: 3, on: projects, values: [1, 2] };
      const through = { ...groupedLimit, through: { where: { userId: [1, 4] } } };
      const ages = { attributes: ['id'], include: [tasks] };
      return [
        await find(User, { groupedLimit, order: ['id'] }),
        await find(User, {
          ...ages,
          groupedLimit,
          order: [lib.fn('ABS', lib.col('age')), ['id', 'DESC']],
        }),
        await find(User, {
          attributes: ['id'],
          order: ['id'],
          groupedLimit: { ...groupedLimit, on: paranoid },
        }),
        await find(User, { order: ['id'], where: { age: -9 }, groupedLimit }),
        await find(User, { order: ['id'], groupedLimit: through }),
      ];
    }));
});
