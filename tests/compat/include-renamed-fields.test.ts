import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "users" (main_id SERIAL PRIMARY KEY, some_other_name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "tasks" (id SERIAL PRIMARY KEY, title TEXT, user_id INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  INSERT INTO "users" (some_other_name) VALUES ('bob'), ('ann'), ('cat');
  INSERT INTO "tasks" (title, user_id) VALUES ('t1', 1), ('t2', 1), ('t3', 2);`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'main_id' },
      name: { type: DataTypes.TEXT, field: 'some_other_name' },
    },
    { tableName: 'users' },
  );
  const Task = sequelize.define(
    'Task',
    { title: DataTypes.TEXT, userId: { type: DataTypes.INTEGER, field: 'user_id' } },
    { tableName: 'tasks' },
  );
  User.hasMany(Task, { foreignKey: 'userId' });
  return { User, Task };
};

const run = (scenario: (models: ReturnType<typeof defineModels>) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => scenario(defineModels(lib, sequelize)));

describe('compat: sub-query with renamed columns', () => {
  it('findOne with a hasMany include', () =>
    run(({ User, Task }) =>
      User.findOne({
        where: { id: 1 },
        include: [{ model: Task, order: [['id', 'ASC']] }] as never,
      }),
    ));

  it('findOne with a required include', () =>
    run(({ User, Task }) =>
      User.findOne({ include: [{ model: Task, required: true, where: { title: 't3' } }] as never }),
    ));

  it('orders by a renamed attribute with limit and a hasMany include', () =>
    run(({ User, Task }) =>
      User.findAll({
        order: [
          ['name', 'DESC'],
          [Task, 'id', 'ASC'],
        ],
        limit: 2,
        include: [Task],
      } as never),
    ));

  it('orders by several renamed attributes with limit', () =>
    run(({ User, Task }) =>
      User.findAll({
        order: ['name', ['id', 'DESC'], [Task, 'id', 'ASC']],
        limit: 2,
        include: [Task],
      } as never),
    ));

  it('filters on the renamed attribute with limit and an include', () =>
    run(({ User, Task }) =>
      User.findAll({
        where: { name: ['ann', 'bob'] },
        order: [
          ['id', 'ASC'],
          [Task, 'id', 'ASC'],
        ],
        limit: 5,
        include: [Task],
      } as never),
    ));
});
