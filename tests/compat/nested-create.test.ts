import { describe, it } from 'vitest';
import { expectSameResult, normalize, type Lib } from '../support/compat.ts';
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

// Sequelize v6 saves sibling children in parallel, so generated ids are not deterministic: rows are
// compared by content, and relations by the content of the referenced row.
const CONTENTS = `
  SELECT 'company' AS kind, c.name AS value, NULL AS parent FROM "Companies" c
  UNION ALL SELECT 'user', u.name, c.name FROM "Users" u LEFT JOIN "Companies" c ON c.id = u."CompanyId"
  UNION ALL SELECT 'profile', p.bio, u.name FROM "Profiles" p LEFT JOIN "Users" u ON u.id = p."UserId"
  UNION ALL SELECT 'post', p.title, u.name FROM "Posts" p LEFT JOIN "Users" u ON u.id = p."UserId"
  UNION ALL SELECT 'comment', c.body, p.title FROM "Comments" c LEFT JOIN "Posts" p ON p.id = c."PostId"
  UNION ALL SELECT 'role', r.label, NULL FROM "Roles" r
  UNION ALL SELECT 'userRole', u.name || '/' || r.label, ur.level FROM "UserRoles" ur
    JOIN "Users" u ON u.id = ur."UserId" JOIN "Roles" r ON r.id = ur."RoleId"
  ORDER BY 1, 2, 3`;

const withoutIds = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutIds)
    : typeof value === 'object' && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'id' && !key.endsWith('Id'))
            .map(([key, item]) => [key, withoutIds(item)]),
        )
      : value;

const run = (scenario: (models: Models) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize);
    const result = await scenario(models);
    return [withoutIds(normalize(result)), await sequelize.query(CONTENTS, { type: 'SELECT' })];
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
