import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Profiles" (id SERIAL PRIMARY KEY, bio TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, rank INTEGER, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Comments" (id SERIAL PRIMARY KEY, body TEXT, "PostId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Roles" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "UserRoles" ("UserId" INTEGER NOT NULL, "RoleId" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL, PRIMARY KEY ("UserId", "RoleId"));`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Profile = sequelize.define('Profile', { bio: DataTypes.TEXT });
  const Post = sequelize.define('Post', { title: DataTypes.TEXT, rank: DataTypes.INTEGER });
  const Comment = sequelize.define('Comment', { body: DataTypes.TEXT });
  const Role = sequelize.define('Role', { label: DataTypes.TEXT });
  User.hasOne(Profile);
  Profile.belongsTo(User);
  User.hasMany(Post);
  Post.belongsTo(User);
  Post.hasMany(Comment);
  Comment.belongsTo(Post);
  User.belongsToMany(Role, { through: 'UserRoles' });
  Role.belongsToMany(User, { through: 'UserRoles' });
  return { User, Profile, Post, Comment, Role };
};

type Models = ReturnType<typeof defineModels>;

const seed = async ({ User, Profile, Post, Comment, Role }: Models) => {
  await User.bulkCreate([{ name: 'ann' }, { name: 'bob' }, { name: 'cid' }]);
  await Profile.bulkCreate([
    { bio: 'ann bio', UserId: 1 },
    { bio: 'bob bio', UserId: 2 },
  ]);
  await Post.bulkCreate([
    { title: 'a1', rank: 2, UserId: 1 },
    { title: 'a2', rank: 1, UserId: 1 },
    { title: 'b1', rank: 3, UserId: 2 },
  ]);
  await Comment.bulkCreate([
    { body: 'c1', PostId: 1 },
    { body: 'c2', PostId: 1 },
    { body: 'c3', PostId: 3 },
  ]);
  await Role.bulkCreate([{ label: 'admin' }, { label: 'editor' }]);
  await sequelizeQuery(
    User,
    `INSERT INTO "UserRoles" VALUES (1, 1, now(), now()), (1, 2, now(), now()), (2, 2, now(), now())`,
  );
};

const sequelizeQuery = (model: { sequelize?: unknown }, sql: string) =>
  (model.sequelize as { query: (text: string) => Promise<unknown> }).query(sql);

const attributeNames = (model: { rawAttributes: object }) => Object.keys(model.rawAttributes);

const run = (scenario: (models: Models, lib: Lib) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize);
    await seed(models);
    return scenario(models, lib);
  });

describe('compat: association definitions', () => {
  it('adds foreign keys, aliases and accessors like v6', () =>
    run(async (models, lib) => {
      const { User, Post } = models;

      const association = (name: string) => {
        const value = (
          User.associations as Record<
            string,
            { associationType: string; as: string; foreignKey: string; accessors: object }
          >
        )[name];
        return value === undefined
          ? undefined
          : [value.associationType, value.as, value.foreignKey, value.accessors];
      };
      void lib;
      return [
        attributeNames(Post),
        attributeNames(models.Profile),
        Object.keys(User.associations),
        association('Posts'),
        association('Profile'),
        association('Roles'),
      ];
    }));
});

describe('compat: include', () => {
  it('hasOne, hasMany, belongsTo, belongsToMany and nested includes', () =>
    run(async ({ User, Profile, Post, Comment, Role }) =>
      Promise.all([
        User.findAll({ include: [Profile], order: [['id', 'ASC']] }),
        User.findAll({
          include: [{ model: Post, include: [Comment] }],
          order: [
            ['id', 'ASC'],
            [Post, 'id', 'ASC'],
            [Post, Comment, 'id', 'ASC'],
          ],
        }),
        Post.findAll({ include: [User], order: [['id', 'ASC']] }),
        User.findAll({
          include: [Role],
          order: [
            ['id', 'ASC'],
            [Role, 'id', 'ASC'],
          ],
        }),
        Comment.findAll({ include: [{ model: Post, include: [User] }], order: [['id', 'ASC']] }),
      ]),
    ));

  it('where / required / attributes on includes', () =>
    run(async ({ User, Post, Role }, lib) =>
      Promise.all([
        User.findAll({
          include: [{ model: Post, where: { rank: { [lib.Op.gte]: 2 } } }],
          order: [['id', 'ASC']],
        }),
        User.findAll({
          include: [{ model: Post, where: { rank: 1 }, required: false }],
          order: [['id', 'ASC']],
        }),
        User.findAll({
          include: [{ model: Post, required: true, attributes: ['title'] }],
          attributes: ['name'],
          order: [
            ['name', 'ASC'],
            [Post, 'title', 'ASC'],
          ],
        }),
        User.findAll({
          include: [{ model: Role, where: { label: 'editor' }, through: { attributes: [] } }],
          order: [['id', 'ASC']],
        }),
        User.findAll({ where: { '$Posts.title$': 'b1' }, include: [Post] }),
      ]),
    ));

  it('order by included attributes and limit with hasMany (sub-query)', () =>
    run(async ({ User, Post }) =>
      Promise.all([
        User.findAll({
          include: [Post],
          order: [
            ['id', 'DESC'],
            [Post, 'rank', 'DESC'],
          ],
          limit: 2,
        }),
        User.findAll({
          include: [{ model: Post, required: true }],
          order: [['id', 'ASC']],
          limit: 1,
          offset: 1,
        }),
        User.findOne({ include: [Post], where: { name: 'ann' }, order: [[Post, 'rank', 'ASC']] }),
        User.findAll({
          include: [{ model: Post, separate: true, order: [['rank', 'ASC']] }],
          order: [['id', 'ASC']],
        }),
      ]),
    ));

  it('raw and nest with includes', () =>
    run(async ({ User, Post }) =>
      Promise.all([
        User.findAll({
          include: [{ model: Post, attributes: ['title'] }],
          attributes: ['name'],
          raw: true,
          order: [
            ['id', 'ASC'],
            [Post, 'id', 'ASC'],
          ],
        }),
        User.findAll({
          include: [{ model: Post, attributes: ['title'] }],
          attributes: ['name'],
          raw: true,
          nest: true,
          order: [
            ['id', 'ASC'],
            [Post, 'id', 'ASC'],
          ],
        }),
      ]),
    ));

  it('count and findAndCountAll with includes', () =>
    run(async ({ User, Post }) =>
      Promise.all([
        User.count({ include: [Post] }),
        User.count({ include: [{ model: Post, required: true }], distinct: true }),
        User.findAndCountAll({ include: [Post], limit: 2, order: [['id', 'ASC']] }),
      ]),
    ));

  it('include all: true', () =>
    run(async ({ Post }) => Post.findAll({ include: [{ all: true }], order: [['id', 'ASC']] })));

  it('errors for unknown associations', () =>
    expectSameError(SCHEMA, async (lib, sequelize) => {
      const { Comment, Role } = defineModels(lib, sequelize);
      return Comment.findAll({ include: [Role] });
    }));
});

describe('compat: accessors', () => {
  it('belongsTo / hasOne accessors', () =>
    run(async ({ User, Post, Profile }) => {
      const post = (await Post.findByPk(3)) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const author = await post['getUser']?.();
      const ann = (await User.findByPk(1)) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      await post['setUser']?.(ann);
      const profile = await ann['getProfile']?.();
      const cid = (await User.findByPk(3)) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const created = await cid['createProfile']?.({ bio: 'cid bio' });
      return [author, await Post.findByPk(3), profile, created, await Profile.count()];
    }));

  it('hasMany accessors', () =>
    run(async ({ User, Post }) => {
      const ann = (await User.findByPk(1)) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const posts = await ann['getPosts']?.({ order: [['id', 'ASC']] });
      const count = await ann['countPosts']?.();
      const has = await ann['hasPost']?.(3);
      await ann['addPost']?.(3);
      const hasNow = await ann['hasPosts']?.([1, 3]);
      await ann['removePost']?.(1);
      await ann['setPosts']?.([2]);
      const created = await ann['createPost']?.({ title: 'new' });
      return [
        posts,
        count,
        has,
        hasNow,
        created,
        await Post.findAll({ attributes: ['id', 'UserId'], order: [['id', 'ASC']] }),
      ];
    }));

  it('belongsToMany accessors', () =>
    run(async ({ User, Role }) => {
      const bob = (await User.findByPk(2)) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const roles = await bob['getRoles']?.({ order: [['id', 'ASC']] });
      const count = await bob['countRoles']?.();
      await bob['addRole']?.(1);
      const has = await bob['hasRoles']?.([1, 2]);
      await bob['removeRole']?.(2);
      await bob['setRoles']?.([2]);
      const created = await bob['createRole']?.({ label: 'viewer' });
      const after = await bob['getRoles']?.({ order: [['id', 'ASC']] });
      void Role;
      return [roles, count, has, created, after];
    }));
});
