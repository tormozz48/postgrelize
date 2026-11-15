import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// Behaviour where postgrelize intentionally differs from Sequelize v6 (ADR-016).
const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  return sequelize;
};

const select = <T>(sequelize: Sequelize, sql: string) =>
  sequelize.query(sql, { type: 'SELECT' }) as Promise<T[]>;

describe('Sequelize issues fixed in postgrelize', () => {
  it('#15466 / #11100 ARRAY(ENUM) values are arrays', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define('User', {
        nick: DataTypes.STRING,
        roles: { type: DataTypes.ARRAY(DataTypes.ENUM('ADMIN', 'CLIENT')), defaultValue: [] },
      });
      await sequelize.sync();
      const [found] = await User.findOrCreate({
        where: { nick: 'n' },
        defaults: { roles: ['ADMIN'] },
      });
      const created = await User.create({ nick: 'm', roles: ['CLIENT', 'ADMIN'] });
      const raw = await User.findAll({ attributes: ['roles'], order: [['id', 'ASC']], raw: true });
      expect([found.get('roles'), created.get('roles'), raw]).toEqual([
        ['ADMIN'],
        ['CLIENT', 'ADMIN'],
        [{ roles: ['ADMIN'] }, { roles: ['CLIENT', 'ADMIN'] }],
      ]);
    }));

  it('#15522 sync creates tables with cyclic foreign keys and adds both constraints', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const A = sequelize.define('A', { status: DataTypes.ENUM('x', 'y') });
      const B = sequelize.define('B', {});
      A.belongsTo(B);
      B.belongsTo(A);
      await sequelize.sync();
      await sequelize.sync();
      const constraints = await select<{ table: string; definition: string }>(
        sequelize,
        `SELECT conrelid::regclass::text AS table, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND connamespace = current_schema()::regnamespace ORDER BY 1`,
      );
      expect(
        constraints.map(({ table, definition }) => [table, definition.split(' ON ')[0]]),
      ).toEqual([
        ['"As"', 'FOREIGN KEY ("BId") REFERENCES "Bs"(id)'],
        ['"Bs"', 'FOREIGN KEY ("AId") REFERENCES "As"(id)'],
      ]);
    }));

  it('#17118 addColumn keeps column comments', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('T', { id: { type: DataTypes.INTEGER, primaryKey: true } });
      await queryInterface.addColumn('T', 'status', {
        type: DataTypes.ENUM('a', 'b'),
        comment: 'status (a)',
      });
      await queryInterface.addColumn('T', 'n', { type: DataTypes.INTEGER, comment: "it's n" });
      const comments = await select<{ name: string; comment: string | null }>(
        sequelize,
        `SELECT attname AS name, col_description(attrelid, attnum) AS comment FROM pg_attribute WHERE attrelid = '"T"'::regclass AND attnum > 0 ORDER BY attnum`,
      );
      expect(comments).toEqual([
        { name: 'id', comment: null },
        { name: 'status', comment: 'status (a)' },
        { name: 'n', comment: "it's n" },
      ]);
    }));

  it('#9040 order by a JSON path sorts by the JSON value', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Doc = sequelize.define('Doc', { data: DataTypes.JSONB, legacy: DataTypes.JSON });
      await sequelize.sync();
      await Doc.bulkCreate([
        { data: { n: 10, k: 'b' }, legacy: { n: 2 } },
        { data: { n: 9, k: 'c' }, legacy: { n: 30 } },
        { data: { n: 100, k: 'a' }, legacy: { n: 1 } },
      ]);
      const ordered = async (order: unknown) =>
        (await Doc.findAll({ order: order as never })).map((doc) => doc.get('data'));
      expect(await ordered(['data.n'])).toEqual([
        { n: 9, k: 'c' },
        { n: 10, k: 'b' },
        { n: 100, k: 'a' },
      ]);
      expect(
        (await ordered([['data.k', 'DESC']])).map((data) => (data as { k: string }).k),
      ).toEqual(['c', 'b', 'a']);
      expect((await ordered(['legacy.n'])).map((data) => (data as { n: number }).n)).toEqual([
        100, 10, 9,
      ]);
    }));

  it('#17486 upsert keeps supplied timestamps of attributes mapped to other fields', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Event = sequelize.define('Event', {
        key: { type: DataTypes.STRING, unique: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
      });
      await sequelize.sync();
      const stamp = new Date('2020-01-01T00:00:00Z');
      await Event.upsert({ key: 'b', createdAt: stamp, updatedAt: stamp });
      await Event.upsert({ key: 'b', createdAt: stamp, updatedAt: stamp });
      const row = await Event.findOne();
      expect([row?.get('createdAt'), row?.get('updatedAt')]).toEqual([stamp, stamp]);
    }));

  it('#18617 JSON keys with commas, quotes and backslashes', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Doc = sequelize.define('Doc', { meta: DataTypes.JSONB });
      await sequelize.sync();
      await Doc.create({ meta: { 'a,b': 2, 'C:\\tmp': 1, 'say "hi"': 4, n: { 'x,y': 5 } } });
      const count = (where: unknown) => Doc.count({ where: { meta: where } as never });
      expect([
        await count({ 'a,b': 2 }),
        await count({ 'C:\\tmp': 1 }),
        await count({ 'say "hi"': 4 }),
        await count({ n: { 'x,y': 5 } }),
      ]).toEqual([1, 1, 1, 1]);
    }));

  it('#5173 jsonb operators on nested paths', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Doc = sequelize.define('Doc', { doc: DataTypes.JSONB });
      await sequelize.sync();
      await Doc.create({ doc: { browsers: ['chrome', 'ff'], meta: { tags: { a: 1 } } } });
      const count = (where: unknown) => Doc.count({ where: { doc: where } as never });
      expect([
        await count({ browsers: { [Op.contains]: ['chrome'] } }),
        await count({ browsers: { [Op.contains]: ['safari'] } }),
        await count({ browsers: { [Op.contained]: ['chrome', 'ff', 'x'] } }),
        await count({ meta: { tags: { [Op.hasKey]: 'a' } } }),
        await count({ meta: { [Op.contains]: { tags: { a: 1 } } } }),
      ]).toEqual([1, 0, 1, 1, 1]);
    }));

  it('#16043 Op.any shorthand', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Item = sequelize.define('Item', { userId: DataTypes.INTEGER });
      await sequelize.sync();
      await Item.bulkCreate([{ userId: 1 }, { userId: 2 }, { userId: 3 }]);
      expect(await Item.count({ where: { userId: { [Op.any]: [1, 3] } } })).toBe(2);
    }));

  it('#14497 upsert with overriding on a GENERATED ALWAYS identity', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Item = sequelize.define('Item', {
        id: { type: DataTypes.INTEGER, primaryKey: true, identity: 'always' },
        name: DataTypes.TEXT,
      });
      await sequelize.sync();
      await Item.create({ name: 'x' });
      await Item.upsert({ id: 1, name: 'y' }, { overriding: 'system' });
      await Item.upsert({ id: 5, name: 'z' }, { overriding: 'system' });
      expect(
        await Item.findAll({ attributes: ['id', 'name'], order: [['id', 'ASC']], raw: true }),
      ).toEqual([
        { id: 1, name: 'y' },
        { id: 5, name: 'z' },
      ]);
    }));

  it('#12595 upsert targets a partial unique index with its predicate', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Pair = sequelize.define(
        'Pair',
        {
          firstId: DataTypes.INTEGER,
          secondId: DataTypes.INTEGER,
          stampedAt: DataTypes.DATE,
          value: DataTypes.INTEGER,
        },
        {
          indexes: [{ unique: true, fields: ['firstId', 'secondId'], where: { stampedAt: null } }],
        },
      );
      await sequelize.sync();
      await Pair.upsert({ firstId: 1, secondId: 1, value: 1 });
      await Pair.upsert({ firstId: 1, secondId: 1, value: 2 });
      expect(await Pair.findAll({ attributes: ['firstId', 'value'], raw: true })).toEqual([
        { firstId: 1, value: 2 },
      ]);
    }));

  it('bulkCreate({ ignoreDuplicates }) assigns returned rows to the inserted records', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Key = sequelize.define('Key', { k: { type: DataTypes.STRING, unique: true } });
      await sequelize.sync();
      await Key.create({ k: 'a' });
      const created = await Key.bulkCreate([{ k: 'a' }, { k: 'b' }, { k: 'c' }], {
        ignoreDuplicates: true,
      });
      expect(created.map((key) => [key.get('k'), key.get('id') === null])).toEqual([
        ['a', true],
        ['b', false],
        ['c', false],
      ]);
      const stored = await Key.findAll({ order: [['k', 'ASC']] });
      expect(created.slice(1).map((key) => key.get('id'))).toEqual(
        stored.slice(1).map((key) => key.get('id')),
      );
    }));

  it('#16787 describeTable unquotes literal defaults', () =>
    withSchema(async ({ schema, client }) => {
      await client.query(
        `CREATE TABLE d (a text DEFAULT 'it''s', c text DEFAULT 'x::y', e varchar(5) DEFAULT 'q'::character varying, f timestamptz DEFAULT now())`,
      );
      const sequelize = connect(schema);
      const described = await sequelize
        .getQueryInterface()
        .describeTable({ tableName: 'd', schema });
      expect(Object.values(described).map((column) => column.defaultValue)).toEqual([
        "it's",
        'x::y',
        'q',
        'now()',
      ]);
    }));

  it('#13167 sync({ alter }) keeps the sequence of non-key autoIncrement columns', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Order = sequelize.define('Order', {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        seqNo: { type: DataTypes.INTEGER, autoIncrement: true },
        description: DataTypes.STRING,
      });
      await sequelize.sync();
      await sequelize.sync({ alter: true });
      const first = await Order.create({ description: 'x' });
      const second = await Order.create({ description: 'y' });
      expect([first.get('seqNo'), second.get('seqNo')]).toEqual([1, 2]);
    }));

  it('#18423 sync / drop with schema work in that schema only', () =>
    withSchema(async ({ schema, client }) => {
      const tenant = `${schema}_tenant`;
      await client.query(`CREATE SCHEMA "${tenant}"`);
      try {
        const sequelize = connect(schema);
        const User = sequelize.define('User', { name: DataTypes.STRING });
        const Post = sequelize.define('Post', { kind: DataTypes.ENUM('a', 'b') });
        User.hasMany(Post);
        Post.belongsTo(User);
        await sequelize.sync();
        await User.create({ name: 'keep' });
        await sequelize.sync({ force: true, schema: tenant });
        const tables = await select<{ schema: string; name: string }>(
          sequelize,
          `SELECT table_schema AS schema, table_name AS name FROM information_schema.tables WHERE table_schema IN ('${schema}', '${tenant}') ORDER BY 1, 2`,
        );
        const references = await select<{ definition: string }>(
          sequelize,
          `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND connamespace = '"${tenant}"'::regnamespace`,
        );
        const kept = await User.count();
        await sequelize.drop({ schema: tenant });
        const left = await select<{ n: number }>(
          sequelize,
          `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = '${tenant}'`,
        );
        expect([
          tables,
          references.map((row) => row.definition.split(' ON ')[0]),
          kept,
          left,
        ]).toEqual([
          [
            { schema, name: 'Posts' },
            { schema, name: 'Users' },
            { schema: tenant, name: 'Posts' },
            { schema: tenant, name: 'Users' },
          ],
          [`FOREIGN KEY ("UserId") REFERENCES ${tenant}."Users"(id)`],
          1,
          [{ n: 0 }],
        ]);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${tenant}" CASCADE`);
      }
    }));

  it('#18256 belongsToMany with custom sourceKey and limit', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define('User', { uuid: { type: DataTypes.STRING, unique: true } });
      const Tag = sequelize.define('Tag', { label: DataTypes.STRING });
      const tags = User.belongsToMany(Tag, { through: 'UserTags', sourceKey: 'uuid' });
      await sequelize.sync();
      const user = await User.create({ uuid: 'u1' });
      await User.create({ uuid: 'u2' });
      const tag = await Tag.create({ label: 'x' });
      await (user as unknown as { addTag: (tag: unknown) => Promise<void> }).addTag(tag);
      const found = await User.findAll({
        attributes: ['id'],
        include: [
          { association: tags, attributes: [], through: { attributes: [] }, required: true },
        ],
        limit: 10,
      });
      expect(found.map((row) => row.get('id'))).toEqual([user.get('id')]);
    }));

  it('#12971 top-level $include.attr$ condition with a hasMany include and limit', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define('User', { name: DataTypes.STRING });
      const Tool = sequelize.define('Tool', { name: DataTypes.STRING });
      User.hasMany(Tool, { as: 'Instruments' });
      await sequelize.sync();
      const owner = await User.create({ name: 'a' });
      await User.bulkCreate([{ name: 'b' }, { name: 'c' }]);
      await Tool.create({ name: 't', UserId: owner.get('id') });
      const found = await User.findAll({
        where: { '$Instruments.id$': { [Op.is]: null } },
        include: { model: Tool, as: 'Instruments' },
        limit: 2,
        order: [['id', 'ASC']],
      });
      expect(found.map((user) => user.get('name'))).toEqual(['b', 'c']);
    }));

  it('findEach loads separate includes for every batch', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Author = sequelize.define('Author', { name: DataTypes.STRING });
      const Post = sequelize.define('Post', { title: DataTypes.STRING });
      Author.hasMany(Post, { as: 'posts' });
      await sequelize.sync();
      const authors = await Author.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
      await Post.bulkCreate(
        authors.slice(0, 2).map((author) => ({
          title: `${String(author.get('name'))}1`,
          AuthorId: author.get('id'),
        })),
      );
      const seen: unknown[] = [];
      for await (const author of Author.findEach(
        { include: [{ association: 'posts', separate: true }], order: [['id', 'ASC']] },
        { batchSize: 2 },
      )) {
        seen.push([
          author.get('name'),
          (author.get('posts') as { get: (key: string) => unknown }[]).map((post) =>
            post.get('title'),
          ),
        ]);
      }
      expect(seen).toEqual([
        ['a', ['a1']],
        ['b', ['b1']],
        ['c', []],
      ]);
    }));

  it('describeTable reads enum values of the column type in its own schema, in declared order', () =>
    withSchema(async ({ schema, client }) => {
      const other = `${schema}_other`;
      await client.query(`CREATE SCHEMA "${other}"`);
      try {
        await client.query(
          `CREATE TYPE "${other}"."enum_T_state" AS ENUM ('x', 'y'); CREATE TYPE "enum_T_state" AS ENUM ('open', 'closed'); ALTER TYPE "enum_T_state" ADD VALUE 'archived' BEFORE 'closed'; CREATE TABLE "T" (state "enum_T_state")`,
        );
        const sequelize = connect(schema);
        const described = await sequelize
          .getQueryInterface()
          .describeTable({ tableName: 'T', schema });
        expect(described['state']?.special).toEqual(['open', 'archived', 'closed']);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${other}" CASCADE`);
      }
    }));

  it('nested create saves built instances given as children instead of dropping them', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Post = sequelize.define('Post', { title: DataTypes.TEXT });
      const Comment = sequelize.define('Comment', { body: DataTypes.TEXT });
      Post.hasMany(Comment);
      await sequelize.sync();
      const post = await Post.create(
        { title: 'p', Comments: [Comment.build({ body: 'built' })] } as never,
        { include: [Comment] },
      );
      const rows = await Comment.findAll({ raw: true, attributes: ['body', 'PostId'] });
      expect(rows).toEqual([{ body: 'built', PostId: post.get('id') }]);
    }));

  // v6 maps HSTORE to objects through pg-hstore; postgrelize had left the values as text (fixed in S14).
  it('HSTORE values are objects when written and read', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS hstore');
      const Doc = sequelize.define('Doc', { meta: DataTypes.HSTORE });
      await sequelize.sync();
      await Doc.create({ meta: { a: '1', b: 'two words' } });
      expect((await Doc.findOne())?.get('meta')).toEqual({ a: '1', b: 'two words' });
      expect(await Doc.count({ where: { meta: { [Op.contains]: { a: '1' } } } })).toBe(1);
    }));
});
