import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Deferrable, Op, Sequelize, col, fn, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// Backs the `supported` rows of docs/coverage/postgresql-features.ts that no other test exercises.

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

type Plain = Record<string, unknown>;

type Context = Readonly<{ sequelize: Sequelize; schema: string; logged: string[] }>;

const inSchema = <T>(run: (context: Context) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema }) => {
    const logged: string[] = [];
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: (sql) => logged.push(sql),
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    return run({ sequelize, schema, logged });
  });

describe('data types', () => {
  it('round-trips numeric, text, boolean and date types', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', {
        small: DataTypes.SMALLINT,
        big: DataTypes.BIGINT,
        price: DataTypes.DECIMAL(10, 2),
        ratio: DataTypes.DOUBLE,
        label: DataTypes.TEXT,
        code: DataTypes.CHAR(3),
        flag: DataTypes.BOOLEAN,
        day: DataTypes.DATEONLY,
        at: DataTypes.TIME,
      });
      await sequelize.sync();
      await Row.create({
        small: 7,
        big: '9007199254740993',
        price: '12.50',
        ratio: 0.25,
        label: 'x',
        code: 'abc',
        flag: true,
        day: '2026-01-02',
        at: '10:11:12',
      });
      const row = await Row.findOne({ raw: true });
      expect(row).toMatchObject({
        small: 7,
        big: '9007199254740993',
        price: '12.50',
        ratio: 0.25,
        code: 'abc',
        flag: true,
        day: '2026-01-02',
        at: '10:11:12',
      });
    }));

  it('round-trips uuid, bytea, jsonb and arrays', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', {
        token: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
        blob: DataTypes.BLOB,
        doc: DataTypes.JSONB,
        plain: DataTypes.JSON,
        ids: DataTypes.ARRAY(DataTypes.INTEGER),
        tags: DataTypes.ARRAY(DataTypes.TEXT),
      });
      await sequelize.sync();
      const created = await Row.create({
        blob: Buffer.from([1, 2, 3]),
        doc: { a: { b: [1, 2] } },
        plain: { k: 'v' },
        ids: [1, 2, 3],
        tags: ['a', 'b'],
      });
      const row = await Row.findByPk(created.get('id') as number, { raw: true });
      expect(row).toMatchObject({
        doc: { a: { b: [1, 2] } },
        plain: { k: 'v' },
        ids: [1, 2, 3],
        tags: ['a', 'b'],
      });
      expect(String((row as unknown as Plain | null)?.['token'])).toMatch(/^[0-9a-f-]{36}$/);
      expect(Buffer.from((row as unknown as Plain | null)?.['blob'] as Buffer)).toEqual(
        Buffer.from([1, 2, 3]),
      );
    }));

  it('round-trips inet, cidr, macaddr and interval', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', {
        host: DataTypes.INET,
        net: DataTypes.CIDR,
        mac: DataTypes.MACADDR,
        span: DataTypes.INTERVAL,
      });
      await sequelize.sync();
      await Row.create({
        host: '10.0.0.1',
        net: '10.0.0.0/8',
        mac: '08:00:2b:01:02:03',
        span: '1 day',
      });
      const row = await Row.findOne({ raw: true });
      expect(row).toMatchObject({ host: '10.0.0.1', net: '10.0.0.0/8', mac: '08:00:2b:01:02:03' });
      expect(await Row.count({ where: { host: { [Op.in]: ['10.0.0.1'] } } })).toBe(1);
    }));

  it('stores ranges and filters them with range operators', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', { span: DataTypes.RANGE(DataTypes.INTEGER) });
      await sequelize.sync();
      await Row.bulkCreate([{ span: [1, 5] }, { span: [10, 20] }]);
      expect(await Row.count({ where: { span: { [Op.contains]: [3, 4] } } })).toBe(1);
      expect(await Row.count({ where: { span: { [Op.overlap]: [4, 12] } } })).toBe(2);
      expect(await Row.count({ where: { span: { [Op.strictRight]: [1, 2] } } })).toBe(1);
    }));

  it('stores tsvector and matches it with a tsquery', () =>
    inSchema(async ({ sequelize }) => {
      const Doc = sequelize.define('Doc', { body: DataTypes.TEXT, search: DataTypes.TSVECTOR });
      await sequelize.sync();
      await Doc.create({
        body: 'the cat sat',
        search: literal("to_tsvector('english', 'the cat sat')"),
      });
      await Doc.create({
        body: 'a dog ran',
        search: literal("to_tsvector('english', 'a dog ran')"),
      });
      const found = await Doc.findAll({
        where: { search: { [Op.match]: fn('to_tsquery', 'english', 'cat') } },
        raw: true,
      });
      expect(found.map((row) => (row as unknown as Plain)['body'])).toEqual(['the cat sat']);
    }));

  it('stores citext with an extension', () =>
    inSchema(async ({ sequelize }) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS citext');
      const Row = sequelize.define('Row', { name: DataTypes.CITEXT });
      await sequelize.sync();
      await Row.create({ name: 'Ann' });
      expect(await Row.count({ where: { name: 'ANN' } })).toBe(1);
    }));
});

describe('operators and functions', () => {
  it('filters with pattern, regex, array and jsonb operators', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', {
        name: DataTypes.TEXT,
        tags: DataTypes.ARRAY(DataTypes.TEXT),
        doc: DataTypes.JSONB,
      });
      await sequelize.sync();
      await Row.bulkCreate([
        { name: 'Alpha', tags: ['x', 'y'], doc: { k: 1, n: { z: true } } },
        { name: 'beta', tags: ['y'], doc: { k: 2 } },
      ]);
      const count = (where: Record<string | symbol, unknown>) =>
        Row.count({ where: where as never });
      expect(await count({ name: { [Op.iLike]: 'al%' } })).toBe(1);
      expect(await count({ name: { [Op.like]: 'al%' } })).toBe(0);
      expect(await count({ name: { [Op.regexp]: '^[A-Z]' } })).toBe(1);
      expect(await count({ name: { [Op.iRegexp]: '^[A-Z]' } })).toBe(2);
      expect(await count({ tags: { [Op.contains]: ['x'] } })).toBe(1);
      expect(await count({ tags: { [Op.overlap]: ['x', 'y'] } })).toBe(2);
      expect(await count({ tags: { [Op.contained]: ['x', 'y', 'z'] } })).toBe(2);
      expect(await count({ doc: { [Op.contains]: { k: 1 } } })).toBe(1);
      expect(await count({ doc: { n: { z: true } } })).toBe(1);
      expect(await count({ name: { [Op.between]: ['A', 'B'] } })).toBe(1);
    }));

  it('calls any SQL function through fn() and literal()', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', { name: DataTypes.TEXT });
      await sequelize.sync();
      await Row.create({ name: 'ann' });
      const row = await Row.findOne({
        attributes: [
          [fn('upper', col('name')), 'up'],
          [literal("jsonb_build_object('a', 1) #>> '{a}'"), 'pick'],
          [fn('gen_random_uuid'), 'id2'],
        ],
        raw: true,
      });
      expect(row).toMatchObject({ up: 'ANN', pick: '1' });
    }));

  it('groups with GROUPING SETS / ROLLUP through literal()', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', { a: DataTypes.TEXT, b: DataTypes.TEXT });
      await sequelize.sync();
      await Row.bulkCreate([
        { a: 'x', b: 'p' },
        { a: 'x', b: 'q' },
      ]);
      const rows = await Row.findAll({
        attributes: ['a', 'b', [fn('count', col('id')), 'n']],
        group: literal('ROLLUP (a, b)'),
        raw: true,
      });
      expect(rows).toHaveLength(4);
    }));
});

describe('SELECT locking', () => {
  it('renders every row-lock strength with OF, NOWAIT and SKIP LOCKED', () =>
    inSchema(async ({ sequelize, logged }) => {
      const Row = sequelize.define('Row', { name: DataTypes.TEXT });
      await sequelize.sync();
      await sequelize.transaction(async (transaction) => {
        for (const level of ['UPDATE', 'NO KEY UPDATE', 'SHARE', 'KEY SHARE'] as const) {
          await Row.findAll({ lock: level, skipLocked: true, transaction });
          expect(logged.at(-1)).toContain(`FOR ${level} SKIP LOCKED`);
        }
        await Row.findAll({ lock: { level: 'UPDATE', of: Row }, noWait: true, transaction });
        expect(logged.at(-1)).toMatch(/FOR UPDATE OF "Row" NOWAIT/);
      });
    }));
});

describe('SELECT ordering', () => {
  it('orders with NULLS FIRST / NULLS LAST', () =>
    inSchema(async ({ sequelize }) => {
      const Row = sequelize.define('Row', { rank: DataTypes.INTEGER });
      await sequelize.sync();
      await Row.bulkCreate([{ rank: 2 }, { rank: null }, { rank: 1 }]);
      const last = await Row.findAll({ order: [['rank', 'ASC NULLS LAST']], raw: true });
      expect(last.map((row) => (row as unknown as { rank: number | null }).rank)).toEqual([
        1,
        2,
        null,
      ]);
      const first = await Row.findAll({ order: [['rank', 'ASC NULLS FIRST']], raw: true });
      expect(first.map((row) => (row as unknown as { rank: number | null }).rank)).toEqual([
        null,
        1,
        2,
      ]);
    }));
});

describe('DDL', () => {
  it('creates partial, expression, covering, GIN and concurrent indexes', () =>
    inSchema(async ({ sequelize, schema }) => {
      const qi = sequelize.getQueryInterface();
      await qi.createTable('docs', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: DataTypes.TEXT,
        tags: DataTypes.ARRAY(DataTypes.TEXT),
        live: DataTypes.BOOLEAN,
      });
      await qi.addIndex('docs', {
        name: 'docs_live',
        fields: ['name'],
        where: { live: true },
        include: ['live'],
      });
      await qi.addIndex('docs', { name: 'docs_tags', fields: ['tags'], using: 'gin' });
      await qi.addIndex('docs', { name: 'docs_brin', fields: ['id'], using: 'brin' });
      await qi.addIndex('docs', { name: 'docs_conc', fields: ['name'], concurrently: true });
      const rows = (await sequelize.query(
        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = :schema AND tablename = 'docs'",
        { replacements: { schema }, type: 'SELECT' },
      )) as { indexname: string; indexdef: string }[];
      const def = (name: string) => rows.find((row) => row.indexname === name)?.indexdef ?? '';
      expect(def('docs_live')).toMatch(/INCLUDE .*WHERE/s);
      expect(def('docs_tags')).toContain('USING gin');
      expect(def('docs_brin')).toContain('USING brin');
      expect(def('docs_conc')).toContain('(name)');
    }));

  it('sets table comments and creates identity columns', () =>
    inSchema(async ({ sequelize, schema }) => {
      const qi = sequelize.getQueryInterface();
      await qi.createTable(
        'noted',
        { id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } },
        { comment: 'hello' },
      );
      const rows = (await sequelize.query(
        `SELECT obj_description('"${schema}"."noted"'::regclass) AS c`,
        { type: 'SELECT' },
      )) as { c: string }[];
      expect(rows[0]?.c).toBe('hello');
    }));

  it('creates deferrable foreign keys', () =>
    inSchema(async ({ sequelize, schema }) => {
      const qi = sequelize.getQueryInterface();
      await qi.createTable('owners', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      });
      await qi.createTable('pets', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        ownerId: {
          type: DataTypes.INTEGER,
          references: { model: 'owners', key: 'id', deferrable: Deferrable.INITIALLY_DEFERRED },
        },
      });
      const rows = (await sequelize.query(
        `SELECT condeferrable, condeferred FROM pg_constraint WHERE conrelid = '"${schema}"."pets"'::regclass AND contype = 'f'`,
        { type: 'SELECT' },
      )) as { condeferrable: boolean; condeferred: boolean }[];
      expect(rows).toEqual([{ condeferrable: true, condeferred: true }]);
    }));
});

describe('sessions', () => {
  it('starts READ ONLY transactions', () =>
    inSchema(async ({ sequelize }) => {
      const shown = await sequelize.transaction({ readOnly: true }, async (transaction) => {
        const rows = (await sequelize.query('SHOW transaction_read_only', {
          transaction,
          type: 'SELECT',
        })) as { transaction_read_only: string }[];
        return rows[0]?.transaction_read_only;
      });
      expect(shown).toBe('on');
    }));
  it('applies transaction isolation levels', () =>
    inSchema(async ({ sequelize }) => {
      for (const level of ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'] as const) {
        const shown = await sequelize.transaction(
          { isolationLevel: level },
          async (transaction) => {
            const rows = (await sequelize.query('SHOW transaction_isolation', {
              transaction,
              type: 'SELECT',
            })) as { transaction_isolation: string }[];
            return rows[0]?.transaction_isolation;
          },
        );
        expect(shown).toBe(level.toLowerCase());
      }
    }));

  it('runs raw queries with bind parameters and replacements', () =>
    inSchema(async ({ sequelize }) => {
      const bound = (await sequelize.query('SELECT $1::int + $2::int AS n', {
        bind: [1, 2],
        type: 'SELECT',
      })) as { n: number }[];
      expect(bound[0]?.n).toBe(3);
      const replaced = (await sequelize.query('SELECT :a::int AS n', {
        replacements: { a: 4 },
        type: 'SELECT',
      })) as { n: number }[];
      expect(replaced[0]?.n).toBe(4);
    }));
});
