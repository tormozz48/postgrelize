import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Companies" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "CompanyId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Profiles" (id SERIAL PRIMARY KEY, bio TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Comments" (id SERIAL PRIMARY KEY, body TEXT, "PostId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Roles" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "UserRoles" ("UserId" INTEGER NOT NULL, "RoleId" INTEGER NOT NULL, level TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL, PRIMARY KEY ("UserId", "RoleId"));`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const Company = sequelize.define('Company', { name: DataTypes.TEXT });
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Profile = sequelize.define('Profile', { bio: DataTypes.TEXT });
  const Post = sequelize.define('Post', { title: DataTypes.TEXT });
  const Comment = sequelize.define('Comment', { body: DataTypes.TEXT });
  const Role = sequelize.define('Role', { label: DataTypes.TEXT });
  const UserRoles = sequelize.define('UserRoles', { level: DataTypes.TEXT });
  User.belongsTo(Company);
  User.hasOne(Profile);
  User.hasMany(Post);
  Post.hasMany(Comment);
  User.belongsToMany(Role, { through: UserRoles });
  return { Company, User, Profile, Post, Comment, Role, UserRoles };
};

type Models = ReturnType<typeof defineModels>;

const plain = (
  model: { findAll: (options: object) => Promise<unknown[]> },
  attributes: string[],
  order: string[],
) => model.findAll({ attributes, order: order.map((key) => [key, 'ASC']), raw: true });

const tables = async ({ Company, User, Profile, Post, Comment, Role, UserRoles }: Models) =>
  Promise.all([
    plain(Company, ['id', 'name'], ['id']),
    plain(User, ['id', 'name', 'CompanyId'], ['id']),
    plain(Profile, ['id', 'bio', 'UserId'], ['id']),
    plain(Post, ['id', 'title', 'UserId'], ['id']),
    plain(Comment, ['id', 'body', 'PostId'], ['id']),
    plain(Role, ['id', 'label'], ['id']),
    plain(UserRoles, ['UserId', 'RoleId', 'level'], ['UserId', 'RoleId']),
  ]);

const run = (scenario: (models: Models) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize);
    const result = await scenario(models);
    return [result, await tables(models)];
  });

describe('compat: nested creation', () => {
  it('creates belongsTo, hasOne, hasMany (nested) and belongsToMany associations', () =>
    run(async ({ User, Company, Profile, Post, Comment, Role }) =>
      User.create(
        {
          name: 'ann',
          Company: { name: 'acme' },
          Profile: { bio: 'hi' },
          Posts: [{ title: 'p1', Comments: [{ body: 'c1' }, { body: 'c2' }] }, { title: 'p2' }],
          Roles: [{ label: 'admin', UserRoles: { level: 'high' } }, { label: 'editor' }],
        },
        { include: [Company, Profile, { model: Post, include: [Comment] }, Role] },
      ),
    ));

  it('builds nested instances and saves them later', () =>
    run(async ({ User, Post }) => {
      const user = User.build({ name: 'bob', Posts: [{ title: 'draft' }] }, { include: [Post] });
      const before = user.toJSON();
      await user.save();
      return [before, user];
    }));

  it('bulkCreate with include', () =>
    run(async ({ User, Profile, Post }) =>
      User.bulkCreate(
        [
          { name: 'u1', Profile: { bio: 'b1' }, Posts: [{ title: 't1' }] },
          { name: 'u2', Posts: [{ title: 't2' }, { title: 't3' }] },
        ],
        { include: [Profile, Post] },
      ),
    ));
});
