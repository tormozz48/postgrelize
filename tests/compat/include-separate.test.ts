import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Tasks" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Subtasks" (id SERIAL PRIMARY KEY, title TEXT, "TaskId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  INSERT INTO "Users" (name) VALUES ('ann'), ('bob');
  INSERT INTO "Tasks" (title, "UserId") VALUES ('t1', 1), ('t2', 1), ('t3', 1), ('t4', 2);
  INSERT INTO "Subtasks" (title, "TaskId") VALUES ('a', 1), ('c', 1), ('b', 1), ('z', 2);`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Task = sequelize.define('Task', { title: DataTypes.TEXT });
  const Subtask = sequelize.define('Subtask', { title: DataTypes.TEXT });
  User.hasMany(Task);
  Task.hasMany(Subtask);
  return { User, Task, Subtask };
};

const run = (scenario: (models: ReturnType<typeof defineModels>) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => scenario(defineModels(lib, sequelize)));

describe('compat: separate includes', () => {
  it('a hasMany include with limit loads separately', () =>
    run(({ User, Task }) =>
      User.findAll({
        include: [{ model: Task, limit: 2, order: [['id', 'ASC']] }],
        order: [['id', 'ASC']],
      }),
    ));

  it('selects the parent key when the attributes leave it out', () =>
    run(({ User, Task }) =>
      User.findAll({
        attributes: ['name'],
        include: [{ model: Task, separate: true, order: [['id', 'ASC']] }],
        order: [['name', 'ASC']],
      }),
    ));

  it('selects the foreign key when the include attributes leave it out', () =>
    run(({ User, Task }) =>
      User.findAll({
        include: [{ model: Task, separate: true, attributes: ['title'], order: [['id', 'ASC']] }],
        order: [['id', 'ASC']],
      }),
    ));

  it('orders a separate include nested under a separate include', () =>
    run(({ User, Task, Subtask }) =>
      User.findAll({
        include: [
          {
            model: Task,
            separate: true,
            order: [['id', 'ASC']],
            include: [{ model: Subtask, separate: true, order: [['title', 'DESC']] }],
          },
        ],
        order: [['id', 'ASC']],
      }),
    ));
});
