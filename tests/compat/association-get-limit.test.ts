import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

describe('compat: association.get of several instances with limit and order', () => {
  it('limits the rows of each instance, with and without includes', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', {});
      const Category = sequelize.define('Category', {});
      const Task = sequelize.define('Task', {
        title: lib.DataTypes.STRING,
        categoryId: { type: lib.DataTypes.INTEGER, field: 'category_id' },
      });
      const tasks = User.hasMany(Task, { as: 'tasks' });
      Task.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });
      await sequelize.sync({ force: true });
      const users: Model[] = [await User.create(), await User.create(), await User.create()];
      const category = await Category.create();
      for (const [owner, titles] of [
        [1, 'bdca'],
        [2, 'zy'],
      ] as const) {
        for (const title of titles) {
          await Task.create({ title, UserId: owner, categoryId: category.get('id') } as never);
        }
      }
      const titles = async (options: object): Promise<unknown> => {
        const found = (await (tasks as unknown as { get: (...a: unknown[]) => unknown }).get(
          users,
          options,
        )) as Record<string, Model[]>;
        return Object.entries(found).map(([key, rows]) => [key, rows.map((t) => t.get('title'))]);
      };
      const options = { limit: 2, order: [['title', 'ASC']] };
      return [
        await titles(options),
        await titles({ ...options, include: [{ model: Category, as: 'category' }] }),
        await titles({ ...options, where: { title: ['a', 'b', 'z'] } }),
      ];
    }));
});
