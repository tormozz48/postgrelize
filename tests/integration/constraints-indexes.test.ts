import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Deferrable,
  ExclusionConstraintError,
  Op,
  PartitionBound,
  QueryTypes,
  Sequelize,
  UniqueConstraintError,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';
import { registerFileDatabase } from '../support/file-database-hooks.ts';

// Extensions are database-wide: a parallel file that creates the same one would break this file.
registerFileDatabase();

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

const select = async <T>(sequelize: Sequelize, sql: string): Promise<T[]> =>
  (await sequelize.query(sql, { type: QueryTypes.SELECT })) as T[];

describe('expression indexes', () => {
  it('creates unique expression indexes with addIndex and enforces them', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('users', { email: DataTypes.TEXT, created: DataTypes.DATE });
      await queryInterface.addIndex('users', {
        name: 'users_lower_email',
        unique: true,
        fields: [{ expression: 'lower(email)', operator: 'text_pattern_ops' }],
      });
      await queryInterface.addIndex('users', {
        name: 'users_created_desc',
        fields: [{ expression: 'length(email)', order: 'DESC', nulls: 'LAST' }],
        include: ['email'],
      });
      await sequelize.query("INSERT INTO users (email) VALUES ('A@x.io')");
      await expect(sequelize.query("INSERT INTO users (email) VALUES ('a@X.io')")).rejects.toThrow(
        UniqueConstraintError,
      );
      const defs = await select<{ indexdef: string }>(
        sequelize,
        `SELECT indexdef FROM pg_indexes WHERE schemaname = '${schema}' AND tablename = 'users' ORDER BY indexname`,
      );
      expect(defs[0]?.indexdef).toContain('DESC NULLS LAST');
      expect(defs[0]?.indexdef).toContain('INCLUDE (email)');
      expect(defs[1]?.indexdef).toContain('lower(email)');
      await queryInterface.removeIndex('users', 'users_lower_email');
    }));

  it('creates model expression indexes through sync', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const User = sequelize.define(
        'User',
        { email: DataTypes.TEXT, name: DataTypes.TEXT },
        {
          tableName: 'users',
          indexes: [
            { name: 'users_lower_email', unique: true, fields: [{ expression: 'lower(email)' }] },
            { fields: [{ name: 'name', collate: 'C', nulls: 'FIRST' }] },
          ],
        },
      );
      await User.sync();
      await User.create({ email: 'A@x.io' });
      await expect(User.create({ email: 'a@x.io' })).rejects.toThrow(UniqueConstraintError);
      const names = await select<{ indexname: string }>(
        sequelize,
        `SELECT indexname FROM pg_indexes WHERE schemaname = '${schema}' AND tablename = 'users' ORDER BY indexname`,
      );
      expect(names.map((row) => row.indexname)).toEqual([
        'users_lower_email',
        'users_name',
        'users_pkey',
      ]);
    }));
});

describe('EXCLUDE constraints', () => {
  it('rejects overlapping ranges for the same room and honours the predicate', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
      await queryInterface.createTable('bookings', {
        room: DataTypes.INTEGER,
        period: { type: DataTypes.RANGE(DataTypes.INTEGER) },
        cancelled: DataTypes.BOOLEAN,
      });
      await queryInterface.addConstraint('bookings', {
        type: 'exclude',
        name: 'bookings_no_overlap',
        using: 'gist',
        exclude: [
          { name: 'room', with: '=' },
          { name: 'period', with: '&&' },
        ],
        where: { cancelled: false },
      });
      await sequelize.query("INSERT INTO bookings VALUES (1, '[1,5)', false)");
      await sequelize.query("INSERT INTO bookings VALUES (1, '[1,5)', true)");
      await sequelize.query("INSERT INTO bookings VALUES (2, '[1,5)', false)");
      await expect(
        sequelize.query("INSERT INTO bookings VALUES (1, '[3,8)', false)"),
      ).rejects.toThrow(ExclusionConstraintError);
      await queryInterface.removeConstraint('bookings', 'bookings_no_overlap');
      await queryInterface.createTable('slots', { room: DataTypes.INTEGER, note: DataTypes.TEXT });
      await queryInterface.addConstraint('slots', {
        type: 'exclude',
        name: 'slots_room_once',
        exclude: [{ expression: 'room + 0', with: '=' }],
        include: ['note'],
        deferrable: Deferrable.INITIALLY_IMMEDIATE,
      });
      await sequelize.query('INSERT INTO slots (room) VALUES (1)');
      await expect(sequelize.query('INSERT INTO slots (room) VALUES (1)')).rejects.toThrow(
        ExclusionConstraintError,
      );
    }));
});

describe('NOT VALID constraints', () => {
  it('adds a constraint over bad rows, then validates after the fix', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('products', { price: DataTypes.INTEGER });
      await sequelize.query('INSERT INTO products (price) VALUES (-1)');
      await queryInterface.addConstraint('products', {
        type: 'check',
        fields: ['price'],
        name: 'products_price_positive',
        where: { price: { [Op.gt]: 0 } },
        notValid: true,
      });
      await expect(sequelize.query('INSERT INTO products (price) VALUES (-2)')).rejects.toThrow(
        /violates check/,
      );
      await expect(
        queryInterface.validateConstraint('products', 'products_price_positive'),
      ).rejects.toThrow(/is violated by some row/);
      await sequelize.query('UPDATE products SET price = 1');
      await queryInterface.validateConstraint('products', 'products_price_positive');
      const [row] = await select<{ convalidated: boolean }>(
        sequelize,
        "SELECT convalidated FROM pg_constraint WHERE conname = 'products_price_positive'",
      );
      expect(row?.convalidated).toBe(true);
    }));
});

describe('declarative partitioning', () => {
  it('routes rows through range partitions, a default partition and sub-partitions', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable(
        'events',
        { at: DataTypes.INTEGER, kind: DataTypes.TEXT },
        { partitionBy: { strategy: 'range', columns: ['at'] } },
      );
      await queryInterface.createPartition('events', 'events_low', {
        from: [PartitionBound.MINVALUE],
        to: [10],
      });
      await queryInterface.createPartition(
        'events',
        { tableName: 'events_mid', schema },
        { from: [10], to: [20] },
        { partitionBy: { strategy: 'list', columns: ['kind'] }, ifNotExists: true },
      );
      await queryInterface.createPartition('events_mid', 'events_mid_a', { in: ['a'] });
      await queryInterface.createPartition('events', 'events_rest', { default: true });
      await sequelize.query("INSERT INTO events VALUES (1, 'x'), (15, 'a'), (99, 'z')");
      const where = await select<{ tableoid: string; at: number }>(
        sequelize,
        'SELECT tableoid::regclass::text AS tableoid, at FROM events ORDER BY at',
      );
      expect(where.map((row) => row.tableoid.replace(`${schema}.`, ''))).toEqual([
        'events_low',
        'events_mid_a',
        'events_rest',
      ]);
      const tables = await queryInterface.showAllTables();
      expect(tables).toEqual(
        expect.arrayContaining([
          'events',
          'events_low',
          'events_mid',
          'events_mid_a',
          'events_rest',
        ]),
      );
      const description = await queryInterface.describeTable('events');
      expect(Object.keys(description)).toEqual(['at', 'kind']);
    }));

  it('creates hash and list partitions, attaches and detaches', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable(
        'shards',
        { id: DataTypes.INTEGER },
        { partitionBy: { strategy: 'hash', columns: ['id'] } },
      );
      await queryInterface.createPartition('shards', 'shards_0', { modulus: 2, remainder: 0 });
      await queryInterface.createTable('shards_1', { id: DataTypes.INTEGER });
      await queryInterface.attachPartition('shards', 'shards_1', { modulus: 2, remainder: 1 });
      await sequelize.query('INSERT INTO shards SELECT generate_series(1, 20)');
      const counts = await select<{ n: string }>(sequelize, 'SELECT count(*) AS n FROM shards_1');
      expect(Number(counts[0]?.n)).toBeGreaterThan(0);
      await queryInterface.detachPartition('shards', 'shards_1');
      await queryInterface.detachPartition('shards', 'shards_0', { concurrently: true });
      const rest = await select<{ n: string }>(sequelize, 'SELECT count(*) AS n FROM shards');
      expect(rest[0]?.n).toBe('0');
    }));
});
