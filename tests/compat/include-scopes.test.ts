import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, active BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, published BOOLEAN NOT NULL, secret TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Comments" (id SERIAL PRIMARY KEY, body TEXT, hidden BOOLEAN NOT NULL, "PostId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  INSERT INTO "Users" (name, active) VALUES ('ann', true), ('bob', true), ('eve', false);
  INSERT INTO "Posts" (title, published, secret, "UserId") VALUES
    ('a1', true, 's', 1), ('a2', false, 's', 1), ('b1', false, 's', 2), ('e1', true, 's', 3);
  INSERT INTO "Comments" (body, hidden, "PostId") VALUES ('c1', false, 1), ('c2', true, 1), ('c3', false, 4);`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define(
    'User',
    { name: DataTypes.TEXT, active: DataTypes.BOOLEAN },
    { defaultScope: { where: { active: true } } },
  );
  const Post = sequelize.define(
    'Post',
    { title: DataTypes.TEXT, published: DataTypes.BOOLEAN, secret: DataTypes.TEXT },
    {
      defaultScope: { where: { published: true }, attributes: { exclude: ['secret'] } },
      scopes: { drafts: { where: { published: false } } },
    },
  );
  const Comment = sequelize.define(
    'Comment',
    { body: DataTypes.TEXT, hidden: DataTypes.BOOLEAN },
    { defaultScope: { where: { hidden: false } } },
  );
  User.hasMany(Post);
  Post.belongsTo(User);
  Post.hasMany(Comment);
  return { User, Post, Comment };
};

const run = (scenario: (models: ReturnType<typeof defineModels>) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => scenario(defineModels(lib, sequelize)));

const byId = [['id', 'ASC']] as const;

describe('compat: scopes of included models', () => {
  it('applies the default scope of a hasMany include (and makes it required)', () =>
    run(({ User, Post }) =>
      User.unscoped().findAll({ include: [Post], order: [...byId, [Post, 'id', 'ASC']] }),
    ));

  it('keeps optional joins with required: false', () =>
    run(({ User, Post }) =>
      User.unscoped().findAll({
        include: [{ model: Post, required: false }],
        order: [...byId, [Post, 'id', 'ASC']],
      }),
    ));

  it('merges include where with the default scope', () =>
    run(({ User, Post }) =>
      User.findAll({
        include: [{ model: Post, where: { title: 'a1' } }],
        order: byId,
      }),
    ));

  it('applies the default scope of a belongsTo include', () =>
    run(({ User, Post }) => Post.unscoped().findAll({ include: [User], order: byId })));

  it('uses unscoped() and named scopes given as include model', () =>
    run(async ({ User, Post }) => [
      await User.findAll({
        include: [{ model: Post.unscoped() }],
        order: [...byId, [Post, 'id', 'ASC']],
      }),
      await User.findAll({
        include: [{ model: Post.scope('drafts') }],
        order: [...byId, [Post, 'id', 'ASC']],
      }),
    ]));

  it('applies scopes of nested and separate includes', () =>
    run(async ({ User, Post, Comment }) => [
      await User.findAll({
        include: [{ model: Post, required: false, include: [{ model: Comment, required: false }] }],
        order: [...byId, [Post, 'id', 'ASC'], [Post, Comment, 'id', 'ASC']],
      }),
      await User.unscoped().findAll({
        include: [{ model: Post.unscoped(), separate: true, order: byId, include: [Comment] }],
        order: byId,
      }),
    ]));

  it('counts with scoped includes', () =>
    run(({ User, Post }) => User.unscoped().count({ include: [Post], distinct: true })));
});
