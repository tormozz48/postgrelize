import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// Backs the data type rows added by stage S14 in docs/coverage/postgresql-features.ts.

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const inSchema = <T>(run: (sequelize: Sequelize) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema }) => {
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    return run(sequelize);
  });

describe('hstore', () => {
  it('round-trips hstore as objects and filters with hstore operators', () =>
    inSchema(async (sequelize) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS hstore');
      const Row = sequelize.define('Row', {
        meta: { type: DataTypes.HSTORE, defaultValue: { source: 'default' } },
      });
      await sequelize.sync();
      const tricky = { 'a "key"': 'va\\lue, with => "quotes"', empty: '', gone: null };
      await Row.create({ meta: tricky });
      await Row.create({ meta: { color: 'red', size: '3' } });
      await Row.create({});
      const rows = await Row.findAll({ order: [['id', 'ASC']] });
      expect(rows.map((row) => row.get('meta'))).toEqual([
        tricky,
        { color: 'red', size: '3' },
        { source: 'default' },
      ]);
      expect(await Row.count({ where: { meta: { [Op.contains]: { color: 'red' } } } })).toBe(1);
      expect(await Row.count({ where: { meta: { [Op.eq]: { source: 'default' } } } })).toBe(1);
      expect(await Row.count({ where: literal("meta -> 'size' = '3'") })).toBe(1);
      await Row.update(
        { meta: { color: 'blue' } },
        { where: { meta: { [Op.contains]: { size: '3' } } } },
      );
      expect(await Row.count({ where: { meta: { [Op.contains]: { color: 'blue' } } } })).toBe(1);
    }));
});

describe('ltree', () => {
  it('round-trips ltree paths and matches ltree operators', () =>
    inSchema(async (sequelize) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS ltree');
      const Row = sequelize.define('Row', { path: DataTypes.LTREE }, { timestamps: false });
      await sequelize.sync();
      await Row.bulkCreate([
        { path: 'Top' },
        { path: 'Top.Science' },
        { path: 'Top.Science.Astronomy' },
        { path: 'Top.Hobbies' },
      ]);
      expect(await Row.count({ where: { path: 'Top.Science' } })).toBe(1);
      expect(await Row.count({ where: { path: { [Op.in]: ['Top', 'Top.Hobbies'] } } })).toBe(2);
      expect(await Row.count({ where: literal("path <@ 'Top.Science'") })).toBe(2);
      expect(await Row.count({ where: literal("path ~ '*.Astronomy'") })).toBe(1);
      const found = await Row.findOne({ where: { path: 'Top.Science.Astronomy' }, raw: true });
      expect(found).toMatchObject({ path: 'Top.Science.Astronomy' });
    }));
});

describe('timestamp without time zone', () => {
  it('round-trips timestamp columns as local wall-clock Dates', () =>
    inSchema(async (sequelize) => {
      const Row = sequelize.define('Row', {
        at: DataTypes.TIMESTAMP,
        precise: DataTypes.TIMESTAMP(3),
      });
      await sequelize.sync();
      const at = new Date(2024, 0, 2, 3, 4, 5, 678);
      await Row.create({ at, precise: at });
      const row = await Row.findOne();
      expect(row?.get('at')).toEqual(at);
      expect(row?.get('precise')).toEqual(at);
      expect(await Row.count({ where: { at: { [Op.gte]: new Date(2024, 0, 2) } } })).toBe(1);
      expect(await Row.count({ where: { at: { [Op.gt]: at } } })).toBe(0);
      const [info] = (await sequelize.query(
        `SELECT data_type FROM information_schema.columns WHERE table_name = 'Rows' AND column_name = 'at' AND table_schema = current_schema()`,
        { type: 'SELECT' },
      )) as { data_type: string }[];
      expect(info?.data_type).toBe('timestamp without time zone');
    }));
});

describe('money, macaddr8, xml, bit, varbit and tsquery', () => {
  it('round-trips money and filters by amount', () =>
    inSchema(async (sequelize) => {
      const Row = sequelize.define('Row', { price: DataTypes.MONEY }, { timestamps: false });
      await sequelize.sync();
      await Row.bulkCreate([{ price: 12.5 }, { price: '1000.00' }]);
      const rows = await Row.findAll({ order: [['id', 'ASC']] });
      expect(rows.map((row) => String(row.get('price')).replaceAll(/[^0-9.]/g, ''))).toEqual([
        '12.50',
        '1000.00',
      ]);
      expect(await Row.count({ where: { price: { [Op.gt]: '100' } } })).toBe(1);
    }));

  it('round-trips macaddr8', () =>
    inSchema(async (sequelize) => {
      const Row = sequelize.define('Row', { mac: DataTypes.MACADDR8 }, { timestamps: false });
      await sequelize.sync();
      await Row.create({ mac: '08:00:2b:01:02:03:04:05' });
      await Row.create({ mac: '08:00:2b:01:02:03' });
      expect((await Row.findAll({ order: [['id', 'ASC']] })).map((r) => r.get('mac'))).toEqual([
        '08:00:2b:01:02:03:04:05',
        '08:00:2b:ff:fe:01:02:03',
      ]);
      expect(await Row.count({ where: { mac: '08:00:2b:01:02:03:04:05' } })).toBe(1);
    }));

  it('round-trips xml', () =>
    inSchema(async (sequelize) => {
      const Row = sequelize.define('Row', { doc: DataTypes.XML }, { timestamps: false });
      await sequelize.sync();
      await Row.create({ doc: '<book><title>Pg</title></book>' });
      const row = await Row.findOne();
      expect(row?.get('doc')).toBe('<book><title>Pg</title></book>');
      expect(
        await Row.count({ where: literal("(xpath('/book/title/text()', doc))[1]::text = 'Pg'") }),
      ).toBe(1);
      await expect(Row.create({ doc: '<open>' })).rejects.toThrow(/xml/i);
    }));

  it('round-trips bit and bit varying', () =>
    inSchema(async (sequelize) => {
      const Row = sequelize.define(
        'Row',
        {
          flags: DataTypes.BIT(4),
          loose: DataTypes.VARBIT(8),
          one: DataTypes.BIT,
          any: DataTypes.VARBIT,
        },
        { timestamps: false },
      );
      await sequelize.sync();
      await Row.create({ flags: '1010', loose: '101', one: '1', any: '1100110011' });
      const row = await Row.findOne({ raw: true });
      expect(row).toMatchObject({ flags: '1010', loose: '101', one: '1', any: '1100110011' });
      expect(await Row.count({ where: { flags: '1010' } })).toBe(1);
      expect(await Row.count({ where: { loose: { [Op.in]: ['101', '0'] } } })).toBe(1);
      await expect(Row.create({ flags: '10' })).rejects.toThrow(/bit/);
    }));

  it('round-trips tsquery and matches tsvector against it', () =>
    inSchema(async (sequelize) => {
      const Row = sequelize.define('Row', { q: DataTypes.TSQUERY }, { timestamps: false });
      await sequelize.sync();
      await Row.create({ q: "'fat' & 'rat'" });
      await Row.create({ q: "'dog'" });
      expect(await Row.count({ where: { q: "'dog'" } })).toBe(1);
      const row = await Row.findOne({ where: { q: "'fat' & 'rat'" }, raw: true });
      expect((row as Record<string, unknown> | null)?.['q']).toBe("'fat' & 'rat'");
      expect(await Row.count({ where: literal("to_tsvector('a fat rat') @@ q") })).toBe(1);
    }));
});
