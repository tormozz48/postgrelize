import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Deferrable,
  Sequelize,
  UniqueConstraintError,
  type QueryInterface,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  return sequelize;
};

describe('sync extensions', () => {
  it('creates UNIQUE NULLS NOT DISTINCT constraints and indexes', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Device = sequelize.define(
        'Device',
        {
          serial: { type: DataTypes.TEXT, unique: { nullsNotDistinct: true } },
          vendor: DataTypes.TEXT,
          model: DataTypes.TEXT,
        },
        { indexes: [{ unique: true, nullsNotDistinct: true, fields: ['vendor', 'model'] }] },
      );
      await sequelize.sync();
      await Device.create({ serial: null, vendor: 'a', model: null });
      await expect(Device.create({ serial: null, vendor: 'b', model: 'x' })).rejects.toBeInstanceOf(
        UniqueConstraintError,
      );
      await expect(Device.create({ serial: 's', vendor: 'a', model: null })).rejects.toBeInstanceOf(
        UniqueConstraintError,
      );
    }));

  it('applies association foreign keys with v6 referential actions', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define('User', { name: DataTypes.TEXT });
      const Post = sequelize.define('Post', { title: DataTypes.TEXT });
      const Tag = sequelize.define('Tag', { label: DataTypes.TEXT });
      User.hasMany(Post);
      Post.belongsTo(User);
      Post.belongsToMany(Tag, { through: 'PostTags' });
      await sequelize.sync();
      const user = await User.create({ name: 'u' });
      const post = await Post.create({ title: 't', UserId: user.get('id') as number });
      const tag = await Tag.create({ label: 'x' });
      await sequelize.query(
        `INSERT INTO "PostTags" ("PostId", "TagId", "createdAt", "updatedAt") VALUES (${String(post.get('id'))}, ${String(tag.get('id'))}, now(), now())`,
      );
      await User.destroy({ where: {} });
      await post.reload();
      expect(post.get('UserId')).toBeNull();
      await Post.destroy({ where: {} });
      expect(await sequelize.models['PostTags']?.count()).toBe(0);
    }));
});

const up = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.createTable('accounts', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.TEXT, allowNull: false, unique: true },
    plan: { type: DataTypes.ENUM('free', 'pro'), allowNull: false, defaultValue: 'free' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.createTable('sessions', {
    id: { type: DataTypes.UUID, primaryKey: true },
    account_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'accounts', key: 'id', deferrable: Deferrable.INITIALLY_DEFERRED },
      onDelete: 'CASCADE',
    },
  });
  await queryInterface.addIndex('sessions', ['account_id']);
};

const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.dropTable('sessions');
  await queryInterface.dropTable('accounts');
  await queryInterface.dropEnum('enum_accounts_plan');
};

describe('migrations', () => {
  it('runs up and down like a umzug migration', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await up(queryInterface);
      expect(await queryInterface.showAllTables()).toEqual(['accounts', 'sessions']);
      const described = await queryInterface.describeTable('accounts');
      expect(described['plan']).toMatchObject({
        type: 'USER-DEFINED',
        defaultValue: 'free',
        special: ['free', 'pro'],
      });
      expect(described['created_at']?.defaultValue).toBe('now()');
      await queryInterface.bulkInsert('accounts', [{ email: 'a@b.io' }]);
      const [account] = (await sequelize.query('SELECT id FROM accounts', {
        type: 'SELECT',
      })) as Array<{ id: string }>;
      await queryInterface.bulkInsert('sessions', [
        { id: '00000000-0000-4000-8000-000000000001', account_id: account?.id },
      ]);
      expect(await queryInterface.bulkDelete('accounts', { email: 'a@b.io' })).toBe(1);
      expect(
        await sequelize.query('SELECT count(*)::int AS n FROM sessions', {
          type: 'SELECT',
          plain: true,
        }),
      ).toEqual({ n: 0 });
      await down(queryInterface);
      expect(await queryInterface.showAllTables()).toEqual([]);
    }));
});
