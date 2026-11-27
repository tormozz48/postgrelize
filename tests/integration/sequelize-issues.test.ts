import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Model, Op, Sequelize, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';
import { registerFileDatabase } from '../support/file-database-hooks.ts';

// Extensions are database-wide: a parallel file that creates the same one would break this file.
registerFileDatabase();

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

  // v6 renders trigger arguments as typed parameter declarations (`name type`), which PostgreSQL rejects.
  it('createTrigger passes literal arguments to the trigger function', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE TABLE tagged (id serial PRIMARY KEY, tag text)');
      await queryInterface.createFunction(
        'set_tag',
        [],
        'trigger',
        'plpgsql',
        'NEW.tag := TG_ARGV[0]; RETURN NEW;',
      );
      await queryInterface.createTrigger(
        'tagged',
        'tagged_set',
        'before',
        ['insert'],
        'set_tag',
        ['from trigger'],
        ['FOR EACH ROW'],
      );
      await sequelize.query('INSERT INTO tagged DEFAULT VALUES');
      expect(await select(sequelize, 'SELECT tag FROM tagged')).toEqual([{ tag: 'from trigger' }]);
    }));

  it('showConstraint honours the constraint name and the schema of the table', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      await sequelize.query('CREATE TABLE things (id SERIAL PRIMARY KEY, code TEXT UNIQUE)');
      const queryInterface = sequelize.getQueryInterface();
      const all = (await queryInterface.showConstraint('things')) as { constraintName: string }[];
      const one = (await queryInterface.showConstraint('things', 'things_pkey')) as {
        constraintName: string;
        constraintSchema: string;
      }[];
      const other = await queryInterface.showConstraint({ tableName: 'things', schema: 'public' });
      expect(all.map((row) => row.constraintName)).toEqual(
        expect.arrayContaining(['things_code_key', 'things_pkey']),
      );
      expect(one.map((row) => [row.constraintName, row.constraintSchema])).toEqual([
        ['things_pkey', schema],
      ]);
      expect(other).toEqual([]);
    }));

  it('findCreateFind inside a transaction returns the row that won a race and keeps the transaction usable', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Tag = sequelize.define(
        'Tag',
        { name: { type: DataTypes.STRING, unique: true }, color: DataTypes.STRING },
        { timestamps: false },
      );
      await sequelize.sync();
      Tag.beforeCreate(async () => {
        Tag.removeHook('beforeCreate');
        await sequelize.query("INSERT INTO \"Tags\" (name, color) VALUES ('news', 'red')");
      });
      const result = await sequelize.transaction(async (transaction) => {
        const [tag, created] = await Tag.findCreateFind({
          where: { name: 'news' },
          defaults: { color: 'blue' },
          transaction,
        });
        const count = await Tag.count({ transaction });
        return [tag.get('id'), tag.get('color'), created, count];
      });
      // v6 reports `created: true` with an unsaved instance here (it inserts with ON CONFLICT DO NOTHING).
      expect(result).toEqual([1, 'red', false, 1]);
    }));
});

describe('v6 parity: main rows without a selected primary key', () => {
  it('returns every row of a single-association include, whatever was selected', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Cat = sequelize.define('Cat', { code: DataTypes.STRING }, { timestamps: false });
      const Ledger = sequelize.define(
        'Ledger',
        { gross: DataTypes.INTEGER },
        { timestamps: false },
      );
      Ledger.belongsTo(Cat, { as: 'cat' });
      Cat.hasMany(Ledger, { as: 'ledgers' });
      await sequelize.sync();
      const cat = await Cat.create({ code: 'a' });
      const cat2 = await Cat.create({ code: 'b' });
      await Ledger.bulkCreate([
        { gross: 100, catId: cat.get('id') },
        { gross: 100, catId: cat2.get('id') },
      ]);
      const rows = await Ledger.findAll({
        attributes: ['gross'],
        include: [{ association: 'cat', required: true, attributes: ['id'] }],
      });
      const nested = await Cat.findAll({
        attributes: ['code'],
        include: [{ association: 'ledgers', attributes: ['gross'] }],
        order: [['id', 'ASC']],
      });
      expect(rows.map((row) => row.get('gross'))).toEqual([100, 100]);
      // a multi-association include still collapses by the selected values, like v6
      expect(nested.map((row) => row.get('code'))).toEqual(['a', 'b']);
    }));

  it('tableAs aliases the main table', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Item = sequelize.define('Item', { n: DataTypes.INTEGER }, { timestamps: false });
      await sequelize.sync();
      await Item.bulkCreate([{ n: 1 }, { n: 2 }]);
      const rows = await Item.findAll({
        tableAs: 'it',
        where: sequelize.literal('"it"."n" > 1'),
        raw: true,
      });
      expect(rows).toEqual([{ id: 2, n: 2 }]);
    }));
});

describe('v6 parity: save without changes', () => {
  it('runs beforeUpdate and beforeSave when update() changes nothing, and writes nothing', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const calls: string[] = [];
      const queries: string[] = [];
      const U = sequelize.define('U', { status: DataTypes.STRING, note: DataTypes.STRING });
      await sequelize.sync();
      U.addHook('beforeUpdate', 'h', () => void calls.push('beforeUpdate'));
      U.addHook('beforeSave', 'hs', () => void calls.push('beforeSave'));
      const u = await U.create({ status: 'a', note: 'x' });
      calls.length = 0;
      await u.update({ status: 'a' }, { logging: (sql: string) => queries.push(sql) });
      expect(calls).toEqual(['beforeUpdate', 'beforeSave']);
      expect(queries).toEqual([]);
    }));

  it('a before hook that changes a value still gets it written', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const U = sequelize.define('U', { status: DataTypes.STRING, note: DataTypes.STRING });
      await sequelize.sync();
      U.addHook('beforeUpdate', (instance: { set(key: string, value: string): unknown }) =>
        instance.set('note', 'hooked'),
      );
      const u = await U.create({ status: 'a', note: 'x' });
      await u.update({ status: 'a' });
      expect((await U.findByPk(u.get('id') as number))?.get('note')).toBe('hooked');
    }));
});

describe('v6 parity: instance update and validation details', () => {
  it('afterUpdate sees the assigned value, not the one PostgreSQL normalised', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const P = sequelize.define('P', { openingTime: DataTypes.TIME });
      await sequelize.sync();
      const created = await P.create({ openingTime: '09:00' });
      let seen: unknown;
      let previous: unknown;
      P.addHook('afterUpdate', 'h', (instance: unknown) => {
        const row = instance as { get(key: string): unknown; previous(key: string): unknown };
        seen = row.get('openingTime');
        previous = row.previous('openingTime');
      });
      const loaded = await P.findByPk(created.get('id') as number);
      await loaded?.update({ openingTime: '08:30' });
      expect([seen, previous]).toEqual(['08:30', '09:00:00']);
    }));

  it('instance update() drops explicit undefined values', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const P = sequelize.define('P', {
        note: DataTypes.STRING,
        messageId: { type: DataTypes.STRING, allowNull: false },
      });
      await sequelize.sync();
      const p = await P.create({ note: 'a', messageId: 'm1' });
      await p.update({ note: 'b', messageId: undefined });
      const reloaded = await P.findByPk(p.get('id') as number, { raw: true });
      expect(reloaded).toMatchObject({ note: 'b', messageId: 'm1' });
    }));

  it('ValidationErrorItem.original is what a custom validator threw', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      class Refusal extends Error {}
      const P = sequelize.define(
        'P',
        {
          a: DataTypes.INTEGER,
          b: {
            type: DataTypes.INTEGER,
            validate: {
              positive: (v: unknown) => {
                if (Number(v) < 0) throw new Refusal('negative');
              },
            },
          },
        },
        {
          validate: {
            notDegenerate() {
              if ((this as { a: number; b: number }).a === (this as { a: number; b: number }).b) {
                throw new Refusal('a equals b');
              }
            },
          },
        },
      );
      await sequelize.sync();
      const model = (await P.create({ a: 1, b: 1 }).catch((error: unknown) => error)) as {
        errors: { original: unknown }[];
      };
      const attribute = (await P.create({ a: 1, b: -1 }).catch((error: unknown) => error)) as {
        errors: { original: unknown }[];
      };
      expect(model.errors[0]?.original).toBeInstanceOf(Refusal);
      expect(attribute.errors[0]?.original).toBeInstanceOf(Refusal);
    }));
});

describe('v6 parity: Model.name', () => {
  it('equals modelName after init, so SQL built from it matches the table alias', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      class File$1 extends Model {}
      File$1.init({ n: DataTypes.INTEGER }, { sequelize, tableName: 'f23', modelName: 'File' });
      await sequelize.sync();
      await File$1.create({ n: 1 });
      const rows = await File$1.findAll({
        where: literal(`EXISTS (SELECT 1 WHERE "${File$1.name}"."n" = 1)`),
      });
      expect([File$1.name, File$1.modelName, rows.length]).toEqual(['File', 'File', 1]);
    }));
});

describe('v6 parity: plain values of assigned associations', () => {
  it('get({ plain: true }) and toJSON follow only the includes the query loaded', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const A = sequelize.define('A', { name: DataTypes.STRING }, { timestamps: false });
      const B = sequelize.define('B', { label: DataTypes.STRING }, { timestamps: false });
      B.belongsTo(A, { as: 'form' });
      A.hasOne(B, { as: 'transport', foreignKey: 'formId' });
      await sequelize.sync();
      const a = await A.create({ name: 'a' });
      await B.create({ label: 'b', formId: a.get('id') });
      const b = (await B.findByPk(1, { include: [{ association: 'form' }] })) as unknown as {
        form: { transport?: unknown };
        get(options: { plain: true }): Record<string, unknown>;
      };
      b.form.transport = b;
      const plain = b.get({ plain: true });
      expect(Object.keys(plain).toSorted()).toEqual(['formId', 'form', 'id', 'label'].toSorted());
      expect(Object.keys(plain['form'] as object).toSorted()).toEqual(['id', 'name']);
      expect(JSON.parse(JSON.stringify(b))).toEqual(plain);
      expect(b.form.transport).toBe(b);
    }));
});

describe('v6 parity: paranoid destroy and include hooks', () => {
  it('a soft-deleted instance keeps its in-memory values', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const C = sequelize.define('C', { token: DataTypes.STRING }, { paranoid: true });
      type Row = { get(key: string): unknown; set(key: string, value: unknown): void };
      C.addHook('beforeSave', (row: unknown) => {
        const r = row as Row;
        const token = String(r.get('token'));
        if (!token.startsWith('enc:')) r.set('token', `enc:${token}`);
      });
      const decrypt = (row: unknown): void => {
        const r = row as Row;
        r.set('token', String(r.get('token')).replace(/^enc:/, ''));
      };
      C.addHook('afterCreate', decrypt);
      C.addHook('afterUpdate', decrypt);
      await sequelize.sync();
      const c = await C.create({ token: 'plain-token' });
      await sequelize.transaction((transaction) => c.destroy({ transaction }));
      expect(c.get('token')).toBe('plain-token');
      expect(c.get('deletedAt')).toBeInstanceOf(Date);
    }));

  it('beforeFindAfterExpandIncludeAll sees { association } includes resolved to model and as', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const A = sequelize.define('A', {}, { timestamps: false });
      const B = sequelize.define('B', {}, { timestamps: false });
      A.hasMany(B, { as: 'rows' });
      await sequelize.sync();
      let seen: unknown;
      A.addHook(
        'beforeFindAfterExpandIncludeAll',
        (options: { include: { model: unknown; as: string }[] }) => {
          seen = options.include.map((item) => ({ hasModel: item.model === B, as: item.as }));
        },
      );
      await A.findAll({ include: [{ association: 'rows' }] });
      await A.findAll({ include: [A.associations['rows'] as never] });
      expect(seen).toEqual([{ hasModel: true, as: 'rows' }]);
    }));
});

describe('v6 parity: instance update after create with fields, update fields, individualHooks', () => {
  it('an instance created with `fields` can be updated, and updatedAt moves', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const U = sequelize.define('U', { name: DataTypes.STRING, bio: DataTypes.TEXT });
      await sequelize.sync();
      const user = await U.create({ name: 'a' }, { fields: ['name'] });
      const created = user.get('updatedAt') as Date;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await user.update({ bio: 'x' });
      expect((user.get('updatedAt') as Date).getTime()).toBeGreaterThan(created.getTime());
      expect((await user.reload()).get('bio')).toBe('x');
    }));

  it('update assigns only the attributes listed in `fields`', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const U = sequelize.define('U', { bio: DataTypes.TEXT, email: DataTypes.STRING });
      await sequelize.sync();
      const user = await U.create({ email: 'email' });
      await user.update({ bio: 'heyo', email: 'heho' }, { fields: ['bio'] });
      expect(user.get('email')).toBe('email');
      expect(user.get('bio')).toBe('heyo');
    }));

  it('Model.update with individualHooks returns the instances the hooks worked on', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const U = sequelize.define('U', { n: DataTypes.INTEGER, tag: DataTypes.STRING });
      U.addHook('afterUpdate', (row: unknown) => {
        (row as { set(key: string, value: unknown): void }).set('tag', 'after');
      });
      await sequelize.sync();
      await U.bulkCreate([{ n: 1 }, { n: 1 }]);
      const [, rows] = (await U.update(
        { n: 2 },
        { where: { n: 1 }, individualHooks: true },
      )) as unknown as [number, { get(key: string): unknown }[]];
      expect(rows.map((row) => row.get('tag'))).toEqual(['after', 'after']);
    }));
});

describe('v6 parity: logging', () => {
  it('logs SQL with the values inlined, keeps bind in the second argument and sends bound parameters', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Mail = sequelize.define('Mail', {
        sesMessageId: DataTypes.STRING,
        note: DataTypes.STRING,
      });
      await sequelize.sync();
      await Mail.create({ sesMessageId: "a'bc", note: 'n' });
      const logged: { sql: string; options: unknown }[] = [];
      const logging = (sql: string, options?: unknown): void => {
        logged.push({ sql, options });
      };
      const rows = await Mail.findAll({ where: { sesMessageId: "a'bc" }, logging });
      await Mail.update({ note: 'changed' }, { where: { sesMessageId: "a'bc" }, logging });
      const loggedSelect = logged[0]?.sql ?? '';
      expect(loggedSelect).toContain(`WHERE "Mail"."sesMessageId" = 'a''bc'`);
      expect(loggedSelect).not.toMatch(/\$\d/);
      const info = logged[0]?.options as { bind: unknown[]; parameterizedSql: string };
      expect(info.bind).toEqual(["a'bc"]);
      expect(info.parameterizedSql).toContain('"sesMessageId" = $1');
      expect(logged[1]?.sql).toContain(`SET "note" = 'changed'`);
      // the logged text runs as it is
      const replay = await runSelect(sequelize, loggedSelect.replace(/^Executing \([^)]*\): /, ''));
      expect(replay).toHaveLength(rows.length);
    }));
});

const runSelect = (sequelize: Sequelize, sql: string) =>
  sequelize.query(sql, { type: 'SELECT' }) as Promise<unknown[]>;

describe('v6 parity: called data types', () => {
  it('models sync and run with DataTypes.X(...) and new DataTypes.X() columns', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Item = sequelize.define('Item', {
        qty: DataTypes.INTEGER(11),
        big: DataTypes.BIGINT({ length: 20 } as never),
        flag: { type: DataTypes.SMALLINT.UNSIGNED.ZEROFILL(3), defaultValue: 1 },
        ref: DataTypes.UUID(),
        doc: new DataTypes.JSONB(),
        ratio: DataTypes.DOUBLE(10, 2),
        label: DataTypes.CITEXT(),
      });
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS citext');
      await sequelize.sync();
      const created = await Item.create({
        qty: 5,
        big: '9007199254740993',
        ref: '6f9619ff-8b86-d011-b42d-00c04fc964ff',
        doc: { a: 1 },
        ratio: 1.5,
        label: 'Ab',
      });
      const found = await Item.findByPk(created.get('id') as number, { raw: true });
      expect(found).toMatchObject({
        qty: 5,
        big: '9007199254740993',
        flag: 1,
        doc: { a: 1 },
        ratio: 1.5,
        label: 'Ab',
      });
    }));

  it('(no issue) a soft-deleted row whose deletedAt is -Infinity keeps it and stays hidden', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define(
        'User',
        {
          name: { type: DataTypes.STRING, primaryKey: true },
          deletedAt: {
            type: DataTypes.DATE,
            primaryKey: true,
            allowNull: false,
            defaultValue: Infinity as never,
          },
        },
        { paranoid: true },
      );
      await sequelize.sync();
      await User.create({ name: 'live' });
      await User.create({ name: 'gone', deletedAt: -Infinity as never });
      const stored = await select<{ name: string; deletedAt: string }>(
        sequelize,
        'SELECT name, "deletedAt"::text AS "deletedAt" FROM "Users" ORDER BY name',
      );
      expect(stored).toEqual([
        { name: 'gone', deletedAt: '-infinity' },
        { name: 'live', deletedAt: 'infinity' },
      ]);
      expect((await User.findAll()).map((user) => user.get('name'))).toEqual(['live']);
    }));

  it('a bare number where on a paranoid model filters the primary key', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define('User', { name: DataTypes.STRING }, { paranoid: true });
      await sequelize.sync();
      await User.bulkCreate([{ name: 'a' }, { name: 'b' }]);
      const names = async (where: unknown) =>
        (await User.findAll({ where: where as never, order: [['id', 'ASC']] })).map((user) =>
          user.get('name'),
        );
      expect([await names(2), await names(99), await User.count({ where: 1 as never })]).toEqual([
        ['b'],
        [],
        1,
      ]);
    }));
});
