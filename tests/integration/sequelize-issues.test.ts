import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../src/index.ts';
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
});
