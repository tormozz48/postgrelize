import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const select = async <T>(sequelize: Sequelize, sql: string): Promise<T[]> =>
  (await sequelize.query(sql, { type: 'SELECT' })) as T[];

const currentSchema = async (sequelize: Sequelize): Promise<string> =>
  (await select<{ schema: string }>(sequelize, 'SELECT current_schema() AS schema'))[0]?.schema ??
  'public';

const describeTables = async (sequelize: Sequelize, tables: readonly string[]) => {
  const schema = await currentSchema(sequelize);
  const queryInterface = sequelize.getQueryInterface();
  const described = await Promise.all(
    tables.map((table) => queryInterface.describeTable({ tableName: table, schema })),
  );
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(tables.map((table, index) => [table, described[index]])),
    ).replaceAll(schema, '<schema>'),
  );
};

const defineModels = (lib: Lib, sequelize: Sequelize, schema: string) => {
  const { DataTypes } = lib;
  const User = sequelize.define(
    'User',
    {
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      status: { type: DataTypes.ENUM('active', 'blocked'), defaultValue: 'active' },
      score: { type: DataTypes.DECIMAL(10, 2), comment: 'the score' },
      tags: DataTypes.ARRAY(DataTypes.TEXT),
      meta: { type: DataTypes.JSONB, defaultValue: {} },
      big: DataTypes.BIGINT,
      active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { schema, indexes: [{ fields: ['score'] }, { unique: true, fields: ['big', 'email'] }] },
  );
  const Post = sequelize.define(
    'Post',
    { title: { type: DataTypes.STRING(100), allowNull: false } },
    { schema, paranoid: true },
  );
  const Tag = sequelize.define('Tag', { label: DataTypes.TEXT }, { schema, timestamps: false });
  User.hasMany(Post);
  Post.belongsTo(User);
  Post.belongsToMany(Tag, {
    through: { model: sequelize.define('PostTags', {}, { schema, tableName: 'PostTags' }) },
  });
  return { User, Post, Tag };
};

const indexesOf = (sequelize: Sequelize, table: string) =>
  select(
    sequelize,
    `SELECT indexname, regexp_replace(indexdef, ' ON [^ ]+\\.', ' ON ') AS indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = '${table}' ORDER BY indexname`,
  );

const foreignKeysOf = (sequelize: Sequelize) =>
  select(
    sequelize,
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS references, rc.delete_rule, rc.update_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema() ORDER BY 1, 2`,
  );

describe('compat: sync', () => {
  it('creates tables, enums, indexes and foreign keys like v6', () =>
    expectSameResult('', async (lib, sequelize) => {
      defineModels(lib, sequelize, await currentSchema(sequelize));
      await sequelize.sync();
      return [
        await describeTables(sequelize, ['Users', 'Posts', 'Tags', 'PostTags']),
        await indexesOf(sequelize, 'Users'),
        await foreignKeysOf(sequelize),
      ];
    }));

  it('force re-creates and alter brings tables to the model', () =>
    expectSameResult('', async (lib, sequelize) => {
      const schema = await currentSchema(sequelize);
      const { User } = defineModels(lib, sequelize, schema);
      await sequelize.sync();
      await User.create({ email: 'a@b.io' });
      await sequelize.sync({ force: true });
      const countAfterForce = await User.count();
      await sequelize.query(
        'ALTER TABLE "Users" ADD COLUMN legacy TEXT; ALTER TABLE "Users" DROP COLUMN big',
      );
      const Altered = sequelize.define(
        'User',
        {
          email: { type: lib.DataTypes.TEXT, allowNull: true },
          status: { type: lib.DataTypes.ENUM('active', 'blocked'), defaultValue: 'blocked' },
          big: { type: lib.DataTypes.BIGINT, defaultValue: 5 },
          nick: { type: lib.DataTypes.STRING(20), allowNull: false, defaultValue: 'n' },
        },
        { schema },
      );
      await Altered.sync({ alter: true });
      return [countAfterForce, await describeTables(sequelize, ['Users'])];
    }));

  it('drops tables in reverse dependency order', () =>
    expectSameResult('', async (lib, sequelize) => {
      defineModels(lib, sequelize, await currentSchema(sequelize));
      await sequelize.sync();
      await sequelize.drop();
      return select(
        sequelize,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`,
      );
    }));
});

describe('compat: QueryInterface', () => {
  it('column, index and constraint operations', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DataTypes, Op } = lib;
      const queryInterface = sequelize.getQueryInterface();
      const schema = await currentSchema(sequelize);
      const items = { tableName: 'Items', schema };
      await queryInterface.createTable(items, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING, allowNull: false },
        qty: { type: DataTypes.INTEGER, defaultValue: 0 },
      });
      await queryInterface.addColumn(items, 'nick', {
        type: DataTypes.STRING(20),
        allowNull: true,
      });
      await queryInterface.changeColumn(items, 'nick', {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'x',
      });
      await queryInterface.renameColumn(items, 'nick', 'nickname');
      await queryInterface.addIndex(items, ['name'], { name: 'items_name_idx', unique: true });
      await queryInterface.addConstraint(items, {
        type: 'check',
        fields: ['qty'],
        where: { qty: { [Op.gte]: 0 } },
        name: 'qty_non_negative',
      });
      const exists = await queryInterface.tableExists(items);
      await queryInterface.bulkInsert(items, [
        { name: 'a', qty: 1, nickname: 'n1' },
        { name: 'b', qty: 2, nickname: 'n2' },
      ]);
      await queryInterface.bulkUpdate(items, { qty: 5 }, { name: 'a' });
      await queryInterface.bulkDelete(items, { name: 'b' });
      const rows = await select(sequelize, 'SELECT name, qty, nickname FROM "Items" ORDER BY id');
      const violation = await sequelize
        .query(`INSERT INTO "Items" (name, qty) VALUES ('c', -1)`)
        .catch((error: Error) => error.name);
      await queryInterface.removeConstraint(items, 'qty_non_negative');
      await queryInterface.removeIndex(items, 'items_name_idx');
      await queryInterface.removeColumn(items, 'nickname');
      await queryInterface.renameTable(items, 'Things');
      const described = await describeTables(sequelize, ['Things']);
      await queryInterface.dropTable({ tableName: 'Things', schema });
      return [
        exists,
        rows,
        violation,
        described,
        await queryInterface.tableExists({ tableName: 'Things', schema }),
        await indexesOf(sequelize, 'Things'),
      ];
    }));
});
