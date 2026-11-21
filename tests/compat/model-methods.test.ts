import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SETUP = `
  CREATE TABLE users (user_id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, age INTEGER, version INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT, author_id INTEGER);
  INSERT INTO users (name, age) VALUES ('ann', 30), ('bob', 20);`;

const models = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'user_id' },
      name: DataTypes.TEXT,
      age: DataTypes.INTEGER,
    },
    { tableName: 'users', timestamps: false, version: true },
  );
  const Post = sequelize.define(
    'Post',
    { title: DataTypes.TEXT },
    { tableName: 'posts', timestamps: false },
  );
  User.hasMany(Post, { as: 'posts', foreignKey: 'author_id' });
  Post.belongsTo(User, { foreignKey: 'author_id' });
  return { User, Post };
};

const run = (
  scenario: (m: ReturnType<typeof models>, sequelize: Sequelize, lib: Lib) => Promise<unknown>,
) => expectSameResult(SETUP, (lib, sequelize) => scenario(models(lib, sequelize), sequelize, lib));

describe('Model statics match sequelize v6', () => {
  it('describe() and queryInterface', () =>
    // v6 describes `public` unless a schema is given (postgrelize follows search_path), so pass it.
    run(async ({ User }, sequelize) => {
      const [rows] = (await sequelize.query('SELECT current_schema() AS schema')) as unknown as [
        { schema: string }[],
      ];
      return {
        columns: await User.describe(rows[0]?.schema),
        same: User.queryInterface === sequelize.getQueryInterface(),
      };
    }));

  it('findCreateFind finds, creates and re-reads after a unique violation', () =>
    run(async ({ User }) => {
      const found = await User.findCreateFind({ where: { name: 'ann' } });
      const created = await User.findCreateFind({ where: { name: 'cy' }, defaults: { age: 5 } });
      let raced = false;
      User.beforeCreate(async () => {
        raced = true;
        await (User.sequelize as unknown as Sequelize).query(
          "INSERT INTO users (name, age) VALUES ('dee', 1)",
        );
        User.removeHook('beforeCreate');
      });
      const afterRace = await User.findCreateFind({ where: { name: 'dee' }, defaults: { age: 2 } });
      return {
        found: [found[0].get('name'), found[1]],
        created: [created[0].get('age'), created[1]],
        race: [raced, afterRace[0].get('age'), afterRace[1]],
      };
    }));

  it('findCreateFind requires where', () =>
    expectSameError(SETUP, async (lib, sequelize) => {
      const { User } = models(lib, sequelize);
      await (User as unknown as { findCreateFind: (o: object) => Promise<unknown> }).findCreateFind(
        {},
      );
    }));

  it('association lookups', () =>
    run(async ({ User, Post }) => ({
      all: User.getAssociations(Post).map((a) => a.as),
      byAlias: User.getAssociationForAlias(Post, 'posts')?.as ?? null,
      wrongAlias: User.getAssociationForAlias(Post, 'nope')?.as ?? null,
      noAlias: User.getAssociationForAlias(Post)?.as ?? null,
      reverse: Post.getAssociationForAlias(User)?.as ?? null,
      hasAlias: [User.hasAlias('posts'), User.hasAlias('missing')],
    })));

  it('removeAttribute and refreshAttributes', () =>
    run(async ({ User }) => {
      const before = Object.keys(User.rawAttributes);
      User.refreshAttributes();
      const refreshed = Object.keys(User.rawAttributes);
      User.removeAttribute('age');
      const rows = await User.findAll({ order: [['id', 'ASC']], raw: true });
      return { before, refreshed, after: Object.keys(User.rawAttributes), rows };
    }));

  it('dropSchema', () =>
    run(async ({ User }, sequelize) => {
      await sequelize.createSchema('temp_one');
      const before = (await sequelize.showAllSchemas()) as unknown[];
      await User.dropSchema('temp_one');
      const after = (await sequelize.showAllSchemas()) as unknown[];
      return { had: before.includes('temp_one'), has: after.includes('temp_one') };
    }));
});

describe('Model instance methods match sequelize v6', () => {
  it('equalsOneOf, setAttributes, where and toString', () =>
    run(async ({ User }) => {
      const ann = (await User.findOne({ where: { name: 'ann' } }))!;
      const bob = (await User.findOne({ where: { name: 'bob' } }))!;
      ann.setAttributes({ age: 31 });
      return {
        one: [ann.equalsOneOf([bob, ann]), ann.equalsOneOf([bob])],
        age: ann.get('age'),
        changed: ann.changed(),
        where: ann.where(),
        whereVersion: ann.where(true),
        text: String(ann),
      };
    }));
});
