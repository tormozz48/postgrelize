import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "EditorId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Roles" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Tags" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "UserRoles" ("UserId" INTEGER NOT NULL, "RoleId" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL, PRIMARY KEY ("UserId", "RoleId"));`;

type Accessors = Record<string, (...args: unknown[]) => Promise<unknown>>;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Post = sequelize.define('Post', { title: DataTypes.TEXT });
  const Role = sequelize.define('Role', { label: DataTypes.TEXT });
  sequelize.define('Tag', { label: DataTypes.TEXT });
  Post.belongsTo(User, { as: 'Author', foreignKey: 'UserId' });
  Post.belongsTo(User, { as: 'Editor', foreignKey: 'EditorId' });
  User.hasMany(Post);
  User.belongsToMany(Role, { through: 'UserRoles' });
  Role.belongsToMany(User, { through: 'UserRoles' });
  return { User, Post, Role };
};

type Models = ReturnType<typeof defineModels>;

const seed = async ({ User, Post, Role }: Models) => {
  await User.bulkCreate([{ name: 'ann' }, { name: 'bob' }]);
  await Post.bulkCreate([
    { title: 'p1', UserId: 1 },
    { title: 'p2', UserId: null },
  ]);
  await Role.bulkCreate([{ label: 'admin' }, { label: 'editor' }, { label: 'viewer' }]);
};

const run = (scenario: (models: Models, lib: Lib) => Promise<unknown>, same = expectSameResult) =>
  same(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize);
    await seed(models);
    return scenario(models, lib);
  });

const accessors = async (model: { findByPk: (id: number) => Promise<unknown> }, id: number) =>
  (await model.findByPk(id)) as unknown as Accessors;

describe('compat: belongsTo accessors', () => {
  it('createX stores the created row key on the source and returns the created row', () =>
    run(async ({ Post, User }) => {
      const post = await accessors(Post, 2);
      const created = await post['createAuthor']?.({ name: 'cid' });
      return [created, await Post.findByPk(2), await User.count()];
    }));

  it('getX resolves null for an unset key and setX(null) clears the key', () =>
    run(async ({ Post }) => {
      const unset = await (await accessors(Post, 2))['getAuthor']?.();
      const post = await accessors(Post, 1);
      const before = await post['getAuthor']?.();
      await post['setAuthor']?.(null);
      return [unset, before, await Post.findByPk(1, { raw: true })];
    }));

  it('setX with a key value and save: false only changes the instance', () =>
    run(async ({ Post }) => {
      const post = await accessors(Post, 2);
      await post['setAuthor']?.(2, { save: false });
      return [post['UserId' as never], await Post.findByPk(2, { raw: true })];
    }));

  it('getX with an extra where condition and an alias', () =>
    run(async ({ Post }) => {
      const post = await accessors(Post, 1);
      return [
        await post['getAuthor']?.({ where: { name: 'bob' } }),
        await post['getAuthor']?.({ where: { name: 'ann' } }),
        await post['getEditor']?.(),
      ];
    }));
});

describe('compat: belongsToMany accessors', () => {
  it('addX skips links that exist and removeX with nothing removes nothing', () =>
    run(async ({ User, Role }) => {
      const ann = await accessors(User, 1);
      await ann['addRole']?.(1);
      await ann['addRoles']?.([1, 2, 3]);
      await ann['removeRoles']?.([]);
      const afterEmptyRemove = await ann['getRoles']?.({ order: [['id', 'ASC']] });
      await ann['removeRole']?.(2);
      return [
        afterEmptyRemove,
        await ann['getRoles']?.({ order: [['id', 'ASC']] }),
        await ann['countRoles']?.(),
        await Role.count(),
      ];
    }));

  // TODO(parity): v6 honours joinTableAttributes: []; postgrelize still returns the junction row.
  it.fails('getX omits the junction attributes when joinTableAttributes is empty like v6', () =>
    run(async ({ User }) => {
      const ann = await accessors(User, 1);
      await ann['addRoles']?.([1, 2]);
      return ann['getRoles']?.({ order: [['id', 'ASC']], joinTableAttributes: [] });
    }));

  it('addX applies through attributes only to new links', () =>
    run(async ({ User }) => {
      const ann = await accessors(User, 1);
      await ann['addRoles']?.([1, 2], { through: {} });
      return ann['hasRoles']?.([1, 2]);
    }));
});

describe('compat: include resolution errors', () => {
  // TODO(parity): v6 throws SequelizeEagerLoadingError here; postgrelize throws a plain Error.
  it.fails('rejects an include with an alias that does not match like v6', () =>
    run(
      async ({ User, Post }) => User.findAll({ include: [{ model: Post, as: 'nothing' }] }),
      expectSameError,
    ));

  it('rejects an include by an unknown association name', () =>
    run(
      async ({ User }) => User.findAll({ include: [{ association: 'nothing' }] } as never),
      expectSameError,
    ));

  it('rejects an include of a model that is not associated', () =>
    run(async ({ User }) => {
      const Tag = (User.sequelize as Sequelize).model('Tag');
      return User.findAll({ include: [Tag] });
    }, expectSameError));

  // TODO(parity): v6 throws SequelizeEagerLoadingError here; postgrelize throws a plain Error.
  it.fails('rejects an include of a model associated several times without an alias', () =>
    run(async ({ Post, User }) => Post.findAll({ include: [User] }), expectSameError));

  it('resolves an include by association name and by association object', () =>
    run(async ({ Post }) => {
      const byName = await Post.findAll({
        include: [{ association: 'Editor' }],
        order: [['id', 'ASC']],
      } as never);
      const association = (Post.associations as Record<string, unknown>)['Editor'];
      const byObject = await Post.findAll({
        include: [{ association }],
        order: [['id', 'ASC']],
      } as never);
      return [byName, byObject];
    }));
});
