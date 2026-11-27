import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const outcome = (run: () => unknown): string => {
  try {
    run();
    return 'defined';
  } catch (error) {
    return (error as Error).name;
  }
};

describe('compat: declaring an association again', () => {
  it('replaces a default alias and rejects a repeated explicit one', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const options = { timestamps: false };
      const User = sequelize.define('user', {}, options);
      const Project = sequelize.define('project', {}, options);
      const results = [
        outcome(() => User.belongsToMany(Project, { through: 'first' })),
        outcome(() => User.belongsToMany(Project, { through: 'second' })),
        outcome(() => Project.belongsTo(User)),
        outcome(() => Project.belongsTo(User)),
        outcome(() => Project.belongsTo(User, { as: 'owner' })),
        outcome(() => Project.belongsTo(User, { as: 'owner' })),
      ];
      await sequelize.sync();
      const user = (await User.create()) as unknown as {
        addProject(p: unknown): Promise<unknown>;
        countProjects(): Promise<number>;
      };
      await user.addProject(await Project.create());
      const included = await User.findAll({ include: [Project] });
      const through = (
        User as unknown as { associations: { projects: { through: { model: { name: string } } } } }
      ).associations.projects.through.model.name;
      return [results, through, await user.countProjects(), included.map((row) => row.toJSON())];
    }));
});
