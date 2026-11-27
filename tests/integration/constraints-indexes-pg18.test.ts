import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, QueryTypes, Sequelize } from '../../src/index.ts';
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

const probe = new Sequelize(testDatabaseUrl(), { logging: false });
const version = Number(
  (
    (await probe.query('SHOW server_version_num', { type: QueryTypes.SELECT, plain: true })) as {
      server_version_num: string;
    }
  ).server_version_num,
);
await probe.close();

describe.skipIf(version < 180000)('PostgreSQL 18 constraints', () => {
  it('creates NOT ENFORCED check and foreign key constraints', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('parents', { n: DataTypes.INTEGER });
      await queryInterface.addConstraint('parents', {
        type: 'primary key',
        fields: ['n'],
        name: 'parents_pk',
      });
      await queryInterface.createTable('kids', { n: DataTypes.INTEGER });
      await queryInterface.addConstraint('kids', {
        type: 'foreign key',
        fields: ['n'],
        name: 'kids_fk',
        references: { table: 'parents', field: 'n' },
        enforced: false,
      });
      await queryInterface.addConstraint('kids', {
        type: 'check',
        fields: ['n'],
        name: 'kids_positive',
        where: { n: { [Op.gt]: 0 } },
        enforced: false,
      });
      await sequelize.query('INSERT INTO kids (n) VALUES (-5)');
      const rows = (await sequelize.query(
        "SELECT conname, conenforced FROM pg_constraint WHERE conname IN ('kids_fk', 'kids_positive')",
        { type: QueryTypes.SELECT },
      )) as { conenforced: boolean }[];
      expect(rows.map((row) => row.conenforced)).toEqual([false, false]);
    }));

  it('creates temporal keys and PERIOD foreign keys', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
      await queryInterface.createTable('rooms', {
        id: DataTypes.INTEGER,
        valid_at: DataTypes.RANGE(DataTypes.DATE),
      });
      await queryInterface.addConstraint('rooms', {
        type: 'primary key',
        fields: ['id', 'valid_at'],
        name: 'rooms_pk',
        withoutOverlaps: true,
      });
      await queryInterface.createTable('stays', {
        room_id: DataTypes.INTEGER,
        during: DataTypes.RANGE(DataTypes.DATE),
      });
      await queryInterface.addConstraint('stays', {
        type: 'foreign key',
        fields: ['room_id', 'during'],
        name: 'stays_room_fk',
        period: true,
        references: { table: 'rooms', field: 'id', fields: ['id', 'valid_at'] },
      });
      await sequelize.query(
        "INSERT INTO rooms VALUES (1, tstzrange('2026-01-01', '2026-06-01')), (1, tstzrange('2026-06-01', '2027-01-01'))",
      );
      await expect(
        sequelize.query("INSERT INTO rooms VALUES (1, tstzrange('2026-03-01', '2026-07-01'))"),
      ).rejects.toThrow(/conflicting key value|exclusion|unique/i);
      await sequelize.query("INSERT INTO stays VALUES (1, tstzrange('2026-02-01', '2026-09-01'))");
      await expect(
        sequelize.query("INSERT INTO stays VALUES (1, tstzrange('2026-02-01', '2028-01-01'))"),
      ).rejects.toThrow(/violates foreign key/);
    }));
});
