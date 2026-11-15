import { describe, expect, it } from 'vitest';
import {
  AfterCreate,
  AllowNull,
  AutoIncrement,
  BeforeCreate,
  BelongsTo,
  BelongsToMany,
  Column,
  Comment,
  CreatedAt,
  DataTypes,
  Default,
  DefaultScope,
  DeletedAt,
  ForeignKey,
  HasMany,
  HasOne,
  Model,
  PrimaryKey,
  Scopes,
  Table,
  Unique,
  UpdatedAt,
  type Sequelize,
} from '../../src/index.ts';
import { libraries, runScenario, type Lib } from '../support/compat.ts';

const SCHEMA = `
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, active BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL, "deletedAt" TIMESTAMPTZ);
  CREATE TABLE profiles (id SERIAL PRIMARY KEY, bio TEXT, "userId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT, "userId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE roles (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE user_roles ("userId" INTEGER NOT NULL, "roleId" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL, PRIMARY KEY ("userId", "roleId"));
  CREATE TABLE audits (id SERIAL PRIMARY KEY, note TEXT, "creationDate" TIMESTAMPTZ NOT NULL, "updatedOn" TIMESTAMPTZ NOT NULL, "removedAt" TIMESTAMPTZ);`;

const log: string[] = [];

@Table({ tableName: 'users', paranoid: true })
@DefaultScope(() => ({ where: { active: true } }))
@Scopes({ byName: (name: string) => ({ where: { name } }), recent: { order: [['id', 'DESC']] } })
class User extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataTypes.INTEGER)
  id!: number;

  @AllowNull(false)
  @Column(DataTypes.TEXT)
  name!: string;

  @Unique
  @Comment('login email')
  @Column(DataTypes.TEXT)
  email!: string | null;

  @Default(true)
  @AllowNull(false)
  @Column(DataTypes.BOOLEAN)
  active!: boolean;

  @HasOne(() => Profile)
  profile?: Profile;

  @HasMany(() => Post)
  posts?: Post[];

  @BelongsToMany(() => Role, () => UserRole)
  roles?: Role[];

  @BeforeCreate
  static logBefore(user: User): void {
    log.push(`before:${user.name}`);
  }

  @AfterCreate
  static logAfter(user: User): void {
    log.push(`after:${user.name}`);
  }
}

@Table({ tableName: 'profiles' })
class Profile extends Model {
  @PrimaryKey @AutoIncrement @Column(DataTypes.INTEGER) id!: number;
  @Column(DataTypes.TEXT) bio!: string;
  @ForeignKey(() => User) @Column(DataTypes.INTEGER) userId!: number;
  @BelongsTo(() => User) user?: User;
}

@Table({ tableName: 'posts' })
class Post extends Model {
  @PrimaryKey @AutoIncrement @Column(DataTypes.INTEGER) id!: number;
  @Column(DataTypes.TEXT) title!: string;
  @ForeignKey(() => User) @Column(DataTypes.INTEGER) userId!: number;
  @BelongsTo(() => User) author?: User;
}

@Table({ tableName: 'roles' })
class Role extends Model {
  @PrimaryKey @AutoIncrement @Column(DataTypes.INTEGER) id!: number;
  @Column(DataTypes.TEXT) label!: string;
  @BelongsToMany(() => User, () => UserRole) users?: User[];
}

@Table({ tableName: 'user_roles' })
class UserRole extends Model {
  @ForeignKey(() => User) @PrimaryKey @Column(DataTypes.INTEGER) userId!: number;
  @ForeignKey(() => Role) @PrimaryKey @Column(DataTypes.INTEGER) roleId!: number;
}

@Table({ tableName: 'audits', paranoid: true })
class Audit extends Model {
  @PrimaryKey @AutoIncrement @Column(DataTypes.INTEGER) id!: number;
  @Column(DataTypes.TEXT) note!: string;
  @CreatedAt creationDate!: Date;
  @UpdatedAt updatedOn!: Date;
  @DeletedAt removedAt!: Date | null;
}

const defineWithDecorators = (_lib: Lib, sequelize: Sequelize): void => {
  sequelize.addModels([User, Profile, Post, Role, UserRole, Audit]);
};

const defineWithInit = (lib: Lib, sequelize: Sequelize): void => {
  const { DataTypes: T } = lib;
  const id = { type: T.INTEGER, primaryKey: true, autoIncrement: true };
  const hooks = {
    beforeCreate: (user: { name: string }) => log.push(`before:${user.name}`),
    afterCreate: (user: { name: string }) => log.push(`after:${user.name}`),
  };
  const user = sequelize.define(
    'User',
    {
      id,
      name: { type: T.TEXT, allowNull: false },
      email: { type: T.TEXT, unique: true, comment: 'login email' },
      active: { type: T.BOOLEAN, defaultValue: true, allowNull: false },
    },
    {
      tableName: 'users',
      paranoid: true,
      defaultScope: { where: { active: true } },
      scopes: {
        byName: (name: string) => ({ where: { name } }),
        recent: { order: [['id', 'DESC']] },
      },
      hooks,
    } as never,
  );
  const profile = sequelize.define(
    'Profile',
    { id, bio: T.TEXT, userId: T.INTEGER },
    { tableName: 'profiles' },
  );
  const post = sequelize.define(
    'Post',
    { id, title: T.TEXT, userId: T.INTEGER },
    { tableName: 'posts' },
  );
  const role = sequelize.define('Role', { id, label: T.TEXT }, { tableName: 'roles' });
  const userRole = sequelize.define(
    'UserRole',
    {
      userId: { type: T.INTEGER, primaryKey: true },
      roleId: { type: T.INTEGER, primaryKey: true },
    },
    { tableName: 'user_roles' },
  );
  sequelize.define(
    'Audit',
    { id, note: T.TEXT },
    {
      tableName: 'audits',
      paranoid: true,
      createdAt: 'creationDate',
      updatedAt: 'updatedOn',
      deletedAt: 'removedAt',
    },
  );
  user.hasOne(profile, { as: 'profile', foreignKey: 'userId' });
  user.hasMany(post, { as: 'posts', foreignKey: 'userId' });
  user.belongsToMany(role, {
    as: 'roles',
    through: userRole,
    foreignKey: 'userId',
    otherKey: 'roleId',
  });
  profile.belongsTo(user, { as: 'user', foreignKey: 'userId' });
  post.belongsTo(user, { as: 'author', foreignKey: 'userId' });
  role.belongsToMany(user, {
    as: 'users',
    through: userRole,
    foreignKey: 'roleId',
    otherKey: 'userId',
  });
};

const describeModels = (sequelize: Sequelize): unknown =>
  Object.fromEntries(
    Object.keys(sequelize.models)
      .toSorted()
      .map((name) => {
        const model = sequelize.models[name] as unknown as typeof Model;
        return [
          name,
          {
            tableName: model.tableName,
            paranoid: Boolean(model.options.paranoid),
            attributes: Object.fromEntries(
              Object.entries(model.rawAttributes).map(([key, attribute]) => [
                key,
                {
                  type: String(attribute.type.key ?? attribute.type),
                  allowNull: attribute.allowNull,
                  primaryKey: attribute.primaryKey ?? false,
                  autoIncrement: attribute.autoIncrement ?? false,
                  unique: attribute.unique ?? false,
                  comment: attribute.comment,
                  field: attribute.field,
                },
              ]),
            ),
            associations: Object.fromEntries(
              Object.entries(model.associations).map(([alias, association]) => [
                alias,
                {
                  type: association.associationType,
                  target: association.target.name,
                  foreignKey: association.foreignKey,
                },
              ]),
            ),
          },
        ];
      }),
  );

type Loose = {
  create: (values: object) => Promise<{ id: number }>;
  bulkCreate: (values: object[]) => Promise<unknown>;
  destroy: (options: object) => Promise<unknown>;
  findAll: (options?: object) => Promise<unknown[]>;
  findOne: (options?: object) => Promise<{ dataValues: object } | null>;
  scope: (selector: unknown) => Loose;
  unscoped: () => Loose;
};

// Timestamps differ between runs, so they are left out of the compared rows.
const plain = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, item: unknown) => (key.endsWith('At') ? undefined : item)),
  ) as unknown;

const behaviour = async (sequelize: Sequelize): Promise<unknown> => {
  const models = sequelize.models as unknown as Record<string, Loose>;
  const [U, P, R, UR, A] = ['User', 'Post', 'Role', 'UserRole', 'Audit'].map(
    (name) => models[name] as Loose,
  );
  log.length = 0;
  const ann = await U!.create({ name: 'ann', email: 'a@x' });
  await U!.create({ name: 'bob', active: false });
  await P!.bulkCreate([
    { title: 't1', userId: ann.id },
    { title: 't2', userId: ann.id },
  ]);
  const role = await R!.create({ label: 'admin' });
  await UR!.create({ userId: ann.id, roleId: role.id });
  await A!.create({ note: 'n' });
  const withPosts = await U!.findAll({
    include: [{ association: 'posts' }, { association: 'roles' }],
  });
  const viaAuthor = await P!.findAll({
    include: [{ association: 'author' }],
    order: [['id', 'ASC']],
  });
  const named = await U!
    .unscoped()
    .scope({ method: ['byName', 'bob'] })
    .findAll({ attributes: ['id'] });
  await U!.destroy({ where: { name: 'ann' } });
  const columns = { order: [['id', 'ASC']], attributes: ['id', 'name'] };
  return {
    log: [...log],
    postsPerUser: plain(withPosts),
    authors: (plain(viaAuthor) as { author: { name: string } }[]).map((post) => post.author.name),
    named: plain(named),
    active: plain(await U!.findAll(columns)),
    unscoped: plain(await U!.unscoped().findAll(columns)),
    recent: plain(await U!.scope('recent').findAll({ attributes: ['id'] })),
    audits: plain(await A!.findAll({ attributes: ['id', 'note'] })),
    auditKeys: Object.keys((await A!.findOne({ paranoid: false }))?.dataValues ?? {}).toSorted(),
  };
};

const scenario =
  (define: (lib: Lib, sequelize: Sequelize) => void) =>
  async (lib: Lib, sequelize: Sequelize): Promise<unknown> => {
    define(lib, sequelize);
    return { models: describeModels(sequelize), behaviour: await behaviour(sequelize) };
  };

// Raw attribute internals (unique-constraint names, null vs false) differ between v6 and
// postgrelize outside the decorators, so attributes are compared between the two init styles only.
const withoutAttributes = (result: unknown): unknown =>
  JSON.parse(
    JSON.stringify(result, (key, value: unknown) => (key === 'attributes' ? undefined : value)),
  );

describe('decorators vs Model.init', () => {
  it('define the same models, associations, hooks, scopes and results as init on postgrelize and Sequelize v6', async () => {
    const decorated = await runScenario(
      libraries.postgrelize,
      SCHEMA,
      scenario(defineWithDecorators),
    );
    const initialized = await runScenario(libraries.postgrelize, SCHEMA, scenario(defineWithInit));
    const v6 = await runScenario(libraries.sequelize, SCHEMA, scenario(defineWithInit));
    expect(withoutAttributes(initialized)).toEqual(withoutAttributes(v6));
    expect(decorated).toEqual(initialized);
    expect((decorated as { behaviour: { log: string[] } }).behaviour.log).toEqual([
      'before:ann',
      'after:ann',
      'before:bob',
      'after:bob',
    ]);
  });
});
