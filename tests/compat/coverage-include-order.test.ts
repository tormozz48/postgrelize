import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, rank INTEGER, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Comments" (id SERIAL PRIMARY KEY, body TEXT, "PostId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Post = sequelize.define('Post', { title: DataTypes.TEXT, rank: DataTypes.INTEGER });
  const Comment = sequelize.define('Comment', { body: DataTypes.TEXT });
  User.hasMany(Post, { as: 'articles' });
  Post.hasMany(Comment);
  return { User, Post, Comment };
};

type Models = ReturnType<typeof defineModels>;

const seed = async ({ User, Post, Comment }: Models) => {
  await User.bulkCreate([{ name: 'ann' }, { name: 'bob' }, { name: 'cid' }]);
  await Post.bulkCreate([
    { title: 'a1', rank: 2, UserId: 1 },
    { title: 'a2', rank: 1, UserId: 1 },
    { title: 'b1', rank: 3, UserId: 2 },
  ]);
  await Comment.bulkCreate([
    { body: 'z', PostId: 1 },
    { body: 'y', PostId: 1 },
    { body: 'x', PostId: 2 },
    { body: 'w', PostId: 3 },
  ]);
};

const names = (users: unknown) =>
  (users as { name: string; articles: { title: string }[] }[]).map((user) => [
    user.name,
    user.articles.map((post) => post.title),
  ]);

const run = (scenario: (models: Models, lib: Lib) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize);
    await seed(models);
    return scenario(models, lib);
  });

const titles = (posts: unknown) =>
  (posts as { title: string; Comments: { body: string }[] }[]).map((post) => [
    post.title,
    post.Comments.map((comment) => comment.body),
  ]);

type FindAll = (options: object) => Promise<unknown>;

describe('compat: ordering through includes', () => {
  it('orders by an include given as alias, or model and alias', () =>
    run(async ({ User, Post }) => {
      const findAll = User.findAll.bind(User) as FindAll;
      const base = { include: [{ model: Post, as: 'articles' }] };
      return [
        names(
          await findAll({
            ...base,
            order: [
              ['articles', 'rank', 'ASC'],
              ['id', 'ASC'],
            ],
          }),
        ),
        names(
          await findAll({
            ...base,
            order: [
              [{ model: Post, as: 'articles' }, 'title', 'DESC'],
              ['id', 'ASC'],
            ],
          }),
        ),
      ];
    }));

  it('orders by an include given as model, with and without a direction', () =>
    run(async ({ Post, Comment }) => {
      const findAll = Post.findAll.bind(Post) as FindAll;
      const include = [{ model: Comment }];
      return [
        titles(
          await findAll({
            include,
            order: [
              [Comment, 'body', 'ASC'],
              ['id', 'ASC'],
            ],
          }),
        ),
        titles(
          await findAll({
            include,
            order: [
              [Comment, 'body', 'DESC'],
              ['id', 'ASC'],
            ],
          }),
        ),
        titles(await findAll({ include, order: [[Comment, 'body'], ['id']] })),
        titles(await findAll({ include, order: [[{ model: Comment }, 'body', 'DESC'], ['id']] })),
      ];
    }));

  it('orders through nested includes', () =>
    run(async ({ User, Post, Comment }) => {
      const users = (await (User.findAll.bind(User) as FindAll)({
        include: [{ model: Post, as: 'articles', include: [Comment] }],
        order: [
          ['id', 'ASC'],
          ['articles', Comment, 'body', 'ASC'],
        ],
      })) as { name: string; articles: { title: string; Comments: { body: string }[] }[] }[];
      return users.map((user) => [
        user.name,
        user.articles.map((post) => [post.title, post.Comments.map((c) => c.body)]),
      ]);
    }));

  it('orders by a literal or function mixed with attribute ordering', () =>
    run(async ({ User, Post }, lib) => {
      const findAll = User.findAll.bind(User) as FindAll;
      const base = { include: [{ model: Post, as: 'articles' }] };
      return [
        names(
          await findAll({
            ...base,
            order: [lib.literal('"User"."name" DESC'), ['articles', 'rank', 'ASC']],
          }),
        ),
        names(
          await findAll({
            ...base,
            order: [
              [lib.fn('lower', lib.col('User.name')), 'DESC'],
              ['articles', 'rank', 'ASC'],
            ],
          }),
        ),
        names(await findAll({ ...base, order: lib.literal('"User"."name" DESC') })),
      ];
    }));

  it('orders the main table with a plain attribute alongside an include', () =>
    run(async ({ User, Post }) => {
      const findAll = User.findAll.bind(User) as FindAll;
      return names(
        await findAll({
          include: [{ model: Post, as: 'articles' }],
          order: ['name'],
        }),
      );
    }));

  it('orders limited queries through a subquery', () =>
    run(async ({ User, Post }) => {
      const findAll = User.findAll.bind(User) as FindAll;
      return names(
        await findAll({
          include: [{ model: Post, as: 'articles', required: false }],
          order: [
            ['name', 'DESC'],
            ['articles', 'rank', 'ASC'],
          ],
          limit: 2,
        }),
      );
    }));
});
