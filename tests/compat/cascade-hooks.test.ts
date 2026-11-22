import { describe, it } from 'vitest';
import { expectSameError, expectSameResult } from '../support/compat.ts';
import type { Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

type Hookable = {
  beforeDestroy(fn: (instance: unknown) => unknown): void;
  afterDestroy(fn: (instance: unknown) => unknown): void;
};

const setup = async (
  lib: Lib,
  sequelize: Sequelize,
  hooks: boolean,
  kind: 'hasMany' | 'hasOne',
) => {
  const Task = sequelize.define('Task', { title: lib.DataTypes.STRING });
  const Project = sequelize.define('Project', { name: lib.DataTypes.STRING });
  Project[kind](Task, { onDelete: 'cascade', hooks });
  await sequelize.sync({ force: true });
  const project = await Project.create({ name: 'p' });
  await (kind === 'hasMany'
    ? Task.bulkCreate([
        { title: 'a', ProjectId: project.get('id') },
        { title: 'b', ProjectId: project.get('id') },
      ] as never)
    : Task.create({ title: 'a', ProjectId: project.get('id') } as never));
  return { Task, Project, project };
};

describe('compat: onDelete cascade with hooks: true', () => {
  for (const kind of ['hasMany', 'hasOne'] as const) {
    it(`${kind}: destroying the parent runs the hooks of the children`, () =>
      expectSameResult('', async (lib, sequelize) => {
        const { Task, Project, project } = await setup(lib, sequelize, true, kind);
        const seen: string[] = [];
        (Task as unknown as Hookable).beforeDestroy((row) =>
          seen.push(`before:${(row as { get(k: string): string }).get('title')}`),
        );
        (Task as unknown as Hookable).afterDestroy((row) =>
          seen.push(`after:${(row as { get(k: string): string }).get('title')}`),
        );
        await project.destroy();
        return {
          seen: seen.toSorted(),
          tasks: await Task.count(),
          projects: await Project.count(),
        };
      }));

    it(`${kind}: without hooks: true the children are removed by PostgreSQL without their hooks`, () =>
      expectSameResult('', async (lib, sequelize) => {
        const { Task, project } = await setup(lib, sequelize, false, kind);
        const seen: string[] = [];
        (Task as unknown as Hookable).beforeDestroy(() => seen.push('before'));
        await project.destroy();
        return { seen, tasks: await Task.count() };
      }));
  }

  it('an error of a child hook stops the destroy and keeps the parent', () =>
    expectSameError('', async (lib, sequelize) => {
      const { Task, project } = await setup(lib, sequelize, true, 'hasMany');
      (Task as unknown as Hookable).beforeDestroy(() => {
        throw new Error('Whoops!');
      });
      await project.destroy();
    }));

  it('a paranoid parent is soft deleted without cascading', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Task = sequelize.define('Task', { title: lib.DataTypes.STRING });
      const Project = sequelize.define(
        'Project',
        { name: lib.DataTypes.STRING },
        { paranoid: true },
      );
      Project.hasMany(Task, { onDelete: 'cascade', hooks: true });
      await sequelize.sync({ force: true });
      const project = await Project.create({ name: 'p' });
      await Task.create({ title: 'a', ProjectId: project.get('id') } as never);
      const seen: string[] = [];
      (Task as unknown as Hookable).beforeDestroy(() => seen.push('before'));
      await project.destroy();
      return { seen, tasks: await Task.count(), projects: await Project.count() };
    }));
});
