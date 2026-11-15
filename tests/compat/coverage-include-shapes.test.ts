import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Comments" (id SERIAL PRIMARY KEY, body TEXT, "PostId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Roles" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "UserRoles" ("UserId" INTEGER NOT NULL, "RoleId" INTEGER NOT NULL, level INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL, PRIMARY KEY ("UserId", "RoleId"));`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Post = sequelize.define('Post', { title: DataTypes.TEXT });
  const Comment = sequelize.define('Comment', { body: DataTypes.TEXT });
  const Role = sequelize.define('Role', { label: DataTypes.TEXT });
  User.hasMany(Post);
  Post.belongsTo(User);
  Post.hasMany(Comment);
  Comment.belongsTo(Post);
  User.belongsToMany(Role, {
    through: sequelize.define('UserRole', { level: DataTypes.INTEGER }, { tableName: 'UserRoles' }),
  });
  Role.belongsToMany(User, { through: 'UserRoles' });
  return { User, Post, Comment, Role };
};

type Models = ReturnType<typeof defineModels>;

const seed = async ({ User, Post, Comment, Role }: Models, sequelize: Sequelize) => {
  await User.bulkCreate([{ name: 'ann' }, { name: 'bob' }]);
  await Post.bulkCreate([
    { title: 'a1', UserId: 1 },
    { title: 'a2', UserId: 1 },
    { title: 'b1', UserId: 2 },
  ]);
  await Comment.bulkCreate([
    { body: 'c1', PostId: 1 },
    { body: 'c2', PostId: 1 },
    { body: 'c3', PostId: 3 },
  ]);
  await Role.bulkCreate([{ label: 'admin' }, { label: 'editor' }]);
  await sequelize.query(
    `INSERT INTO "UserRoles" VALUES (1, 1, 5, now(), now()), (1, 2, 7, now(), now()), (2, 2, 9, now(), now())`,
  );
};

const run = (scenario: (models: Models, lib: Lib, sequelize: Sequelize) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize);
    await seed(models, sequelize);
    return scenario(models, lib, sequelize);
  });

type FindAll = (options: object) => Promise<unknown>;

describe('compat: include shapes', () => {
  it('limits a query whose single include has a to-many child', () =>
    run(async ({ Comment, Post }) =>
      (Comment.findAll.bind(Comment) as FindAll)({
        include: [{ model: Post, include: [Comment] }],
        order: [['id', 'ASC']],
        limit: 2,
      }),
    ));

  it('applies offset-only paging with a to-many include', () =>
    run(async ({ User, Post }) =>
      (User.findAll.bind(User) as FindAll)({
        include: [Post],
        order: [['id', 'DESC']],
        offset: 1,
      }),
    ));

  it('loads a separate include with nested includes', () =>
    run(async ({ User, Post, Comment }) =>
      (User.findAll.bind(User) as FindAll)({
        include: [{ model: Post, separate: true, include: [Comment] }],
        order: [['id', 'ASC']],
      }),
    ));

  it('keeps main rows that have a required include under limit', () =>
    run(async ({ User, Post, Comment }) =>
      (User.findAll.bind(User) as FindAll)({
        include: [{ model: Post, required: true, include: [{ model: Comment, required: true }] }],
        order: [['id', 'ASC']],
        limit: 5,
      }),
    ));

  it('filters through the junction table of a nested belongsToMany include', () =>
    run(async ({ Post, User, Role }) =>
      (Post.findAll.bind(Post) as FindAll)({
        include: [
          {
            model: User,
            include: [
              {
                model: Role,
                through: { where: { level: 7 } },
                required: true,
              },
            ],
            required: true,
          },
        ],
        order: [['id', 'ASC']],
        limit: 10,
      }),
    ));
});

describe('compat: association definition errors', () => {
  it('rejects a second association with the same alias', () =>
    expectSameError(SCHEMA, async (lib, sequelize) => {
      const { User, Post } = defineModels(lib, sequelize);
      User.hasMany(Post, { as: 'items' });
      User.hasMany(Post, { as: 'items' });
      return 'unreachable';
    }));
});
