import type { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, ForeignKeyConstraintError, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string, extra: Record<string, unknown> = {}): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
    ...extra,
  });
  opened.push(sequelize);
  return sequelize;
};

const tableNames = async (client: Client, schema: string): Promise<string[]> => {
  const result = await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1',
    [schema],
  );
  return result.rows.map((row: { table_name: string }) => row.table_name);
};

describe('Sequelize hooks and sync guards', () => {
  it('manages named and anonymous hooks', () =>
    withSchema(({ schema }) => {
      const sequelize = connect(schema);
      expect(sequelize.hasHook('beforeBulkSync')).toBe(false);
      sequelize.addHook('beforeBulkSync', 'named', () => undefined);
      sequelize.addHook('beforeBulkSync', () => undefined);
      expect(sequelize.hasHook('beforeBulkSync')).toBe(true);
      expect(sequelize.hasHooks('beforeBulkSync')).toBe(true);
      expect(sequelize.hasHooks('afterBulkSync')).toBe(false);
      sequelize.removeHook('beforeBulkSync', 'named');
      expect(sequelize.hasHooks('beforeBulkSync')).toBe(true);
      sequelize.removeHook('beforeBulkSync');
      expect(sequelize.hasHooks('beforeBulkSync')).toBe(false);
      return Promise.resolve();
    }));

  it('runs beforeBulkSync and afterBulkSync around sync()', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const calls: string[] = [];
      sequelize.addHook('beforeBulkSync', () => {
        calls.push('before');
      });
      sequelize.addHook('afterBulkSync', () => {
        calls.push('after');
      });
      await sequelize.sync();
      expect(calls).toEqual(['before', 'after']);
    }));

  it('requires a function when a hook is added by name', () =>
    withSchema(({ schema }) => {
      const sequelize = connect(schema);
      expect(() => sequelize.addHook('beforeBulkSync', 'name')).toThrow(
        'addHook: hook function is required',
      );
      return Promise.resolve();
    }));

  it('refuses to sync a database that does not match the `match` pattern', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      sequelize.define('Thing', { name: DataTypes.TEXT });
      await expect(sequelize.sync({ match: /^nothing_like_it$/ })).rejects.toThrow(
        /does not match sync match parameter/,
      );
      await expect(sequelize.sync({ match: /./ })).resolves.toBe(sequelize);
    }));
});

describe('QueryInterface table and enum helpers', () => {
  it('drops all tables except the skipped ones and all enum types', () =>
    withSchema(async ({ schema, client }) => {
      const sequelize = connect(schema);
      sequelize.define('Keep', { name: DataTypes.TEXT });
      sequelize.define('Drop', { state: DataTypes.ENUM('a', 'b') });
      await sequelize.sync();
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.dropAllTables({ skip: ['Keeps'] });
      expect(await tableNames(client, schema)).toEqual(['Keeps']);
      await queryInterface.dropAllEnums();
      const enums = await client.query(
        "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = $1",
        [schema],
      );
      expect(enums.rows).toEqual([]);
      await queryInterface.dropAllTables();
      expect(await tableNames(client, schema)).toEqual([]);
    }));

  it('bulk-inserts nothing for an empty record list', () =>
    withSchema(async ({ schema, client }) => {
      const sequelize = connect(schema);
      sequelize.define('Item', { name: DataTypes.TEXT });
      await sequelize.sync();
      await sequelize.getQueryInterface().bulkInsert('Items', []);
      expect((await client.query('SELECT count(*)::int AS n FROM "Items"')).rows[0].n).toBe(0);
    }));

  it('rejects describing a table that does not exist', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      await expect(sequelize.getQueryInterface().describeTable('Missing')).rejects.toThrow(
        /No description found for table Missing/,
      );
    }));

  it('describes defaults, nullability, comments and primary keys of real columns', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      sequelize.define('Described', {
        flag: { type: DataTypes.BOOLEAN, defaultValue: false },
        label: { type: DataTypes.STRING, defaultValue: "it's", allowNull: false, comment: 'hello' },
        state: DataTypes.ENUM('x', 'y'),
      });
      await sequelize.sync();
      const description = await sequelize.getQueryInterface().describeTable('Describeds');
      expect(description['flag']).toMatchObject({ type: 'BOOLEAN', defaultValue: false });
      expect(description['label']).toMatchObject({
        defaultValue: "it's",
        allowNull: false,
        comment: 'hello',
      });
      expect(description['id']).toMatchObject({ primaryKey: true });
      expect(description['state']).toMatchObject({ special: ['x', 'y'] });
    }));
});

describe('sync({ alter })', () => {
  it('drops columns that left the model unless alter.drop is false', () =>
    withSchema(async ({ schema }) => {
      const first = connect(schema);
      first.define('Gadget', { name: DataTypes.TEXT, legacy: DataTypes.TEXT });
      await first.sync();
      const keep = connect(schema);
      keep.define('Gadget', { name: DataTypes.TEXT });
      await keep.sync({ alter: { drop: false } });
      expect(Object.keys(await keep.getQueryInterface().describeTable('Gadgets'))).toContain(
        'legacy',
      );
      await keep.sync({ alter: true });
      expect(Object.keys(await keep.getQueryInterface().describeTable('Gadgets'))).not.toContain(
        'legacy',
      );
    }));

  it('adds missing foreign keys and columns to an existing table', () =>
    withSchema(async ({ schema, client }) => {
      const first = connect(schema);
      first.define('Owner', { name: DataTypes.TEXT });
      first.define('Pet', { name: DataTypes.TEXT, OwnerId: DataTypes.INTEGER });
      await first.sync();
      const second = connect(schema);
      const Owner = second.define('Owner', { name: DataTypes.TEXT });
      const Pet = second.define('Pet', { name: DataTypes.TEXT, nick: DataTypes.TEXT });
      Owner.hasMany(Pet);
      await second.sync({ alter: true });
      const constraints = await client.query(
        "SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE table_schema = $1 AND constraint_type = 'FOREIGN KEY'",
        [schema],
      );
      expect(constraints.rows[0].n).toBe(1);
      expect(Object.keys(await second.getQueryInterface().describeTable('Pets'))).toContain('nick');
    }));
});

describe('transactions', () => {
  it('releases the connection and rolls back when BEGIN settings fail', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema, { pool: { max: 1, acquire: 5000 } });
      await expect(
        sequelize.transaction(
          { settings: { 'pgz_missing.setting_without_dot': 'x', bogus: '1' } },
          () => Promise.resolve(),
        ),
      ).rejects.toThrow(/unrecognized configuration parameter/);
      const rows = await sequelize.query('SELECT 1 AS one', { type: 'SELECT' });
      expect(rows).toEqual([{ one: 1 }]);
    }));

  it('rejects a nested transaction whose settings fail and keeps the parent connection pooled', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema, { pool: { max: 1, acquire: 5000 } });
      await expect(
        sequelize.transaction(async (parent) => {
          await sequelize.transaction(
            { transaction: parent, settings: { bogus_unknown_param: '1' } },
            () => Promise.resolve(),
          );
        }),
      ).rejects.toThrow(/unrecognized configuration parameter/);
      const rows = await sequelize.query('SELECT 2 AS two', { type: 'SELECT' });
      expect(rows).toEqual([{ two: 2 }]);
    }));

  it('exposes row lock strengths on the instance and refuses use after the end', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const transaction = await sequelize.transaction();
      expect(transaction.LOCK.UPDATE).toBe('UPDATE');
      await transaction.commit();
      await expect(sequelize.query('SELECT 1', { transaction })).rejects.toThrow(
        /commit has been called on this transaction\([^)]+\), you can no longer use it\./,
      );
      await expect(transaction.commit()).rejects.toThrow(/already been finished|has been finished/);
      await expect(transaction.rollback()).rejects.toThrow(
        'Transaction cannot be rolled back because it has been finished with state: commit',
      );
    }));

  it('does not roll back twice when the callback finished the transaction itself', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      await expect(
        sequelize.transaction(async (transaction) => {
          await transaction.rollback();
          throw new Error('after manual rollback');
        }),
      ).rejects.toThrow('after manual rollback');
    }));

  it('reports a deferred constraint failure at commit and swallows the failed rollback', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema, { pool: { max: 1, acquire: 5000 } });
      await sequelize.query('CREATE TABLE parents (id integer PRIMARY KEY)');
      await sequelize.query(
        'CREATE TABLE children (parent_id integer REFERENCES parents (id) DEFERRABLE INITIALLY DEFERRED)',
      );
      await expect(
        sequelize.transaction(async (transaction) => {
          await sequelize.query('INSERT INTO children VALUES (42)', { transaction });
        }),
      ).rejects.toBeInstanceOf(ForeignKeyConstraintError);
      const rows = await sequelize.query('SELECT count(*)::int AS n FROM children', {
        type: 'SELECT',
      });
      expect(rows).toEqual([{ n: 0 }]);
    }));
});
