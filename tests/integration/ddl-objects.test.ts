import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize, type Transaction } from '../../src/index.ts';
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

const select = async <T>(sequelize: Sequelize, sql: string): Promise<T[]> =>
  (await sequelize.query(sql, { type: QueryTypes.SELECT })) as T[];

describe('extensions', () => {
  it('creates and drops an extension', () =>
    withSchema(async ({ schema }) => {
      const queryInterface = connect(schema).getQueryInterface();
      await queryInterface.createExtension('pg_trgm', { schema });
      await queryInterface.createExtension('pg_trgm', { ifNotExists: true, schema });
      const sequelize = queryInterface.sequelize as Sequelize;
      const names = async () =>
        (
          await select<{ extname: string }>(
            sequelize,
            "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'",
          )
        ).length;
      expect(await names()).toBe(1);
      await queryInterface.dropExtension('pg_trgm');
      expect(await names()).toBe(0);
      await queryInterface.dropExtension('pg_trgm', { ifExists: true });
    }));
});

describe('sequences', () => {
  it('creates, advances, alters and drops a sequence', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createSequence('invoice_no', { start: 100, increment: 5, cache: 1 });
      expect(await queryInterface.nextval('invoice_no')).toBe('100');
      expect(await queryInterface.nextval({ tableName: 'invoice_no', schema })).toBe('105');
      expect(await queryInterface.setval('invoice_no', 500)).toBe('500');
      expect(await queryInterface.nextval('invoice_no')).toBe('505');
      await queryInterface.setval('invoice_no', 900, false);
      expect(await queryInterface.nextval('invoice_no')).toBe('900');
      await queryInterface.alterSequence('invoice_no', { restartWith: 7, increment: 1 });
      expect(await queryInterface.nextval('invoice_no')).toBe('7');
      await queryInterface.dropSequence('invoice_no');
      await queryInterface.dropSequence('invoice_no', { ifExists: true });
      await expect(queryInterface.nextval('invoice_no')).rejects.toThrow(/does not exist/);
    }));

  it('supports bigint bounds, cycling and column ownership', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      sequelize.define('Seq', { name: DataTypes.TEXT }, { timestamps: false });
      await sequelize.sync();
      await queryInterface.createSequence('cyc', {
        dataType: 'smallint',
        minValue: 1,
        maxValue: 2,
        cycle: true,
      });
      expect(await queryInterface.nextval('cyc')).toBe('1');
      expect(await queryInterface.nextval('cyc')).toBe('2');
      expect(await queryInterface.nextval('cyc')).toBe('1');
      await queryInterface.createSequence('big', {
        dataType: 'bigint',
        start: 9_007_199_254_740_993n,
        ifNotExists: true,
      });
      await queryInterface.createSequence('big', { ifNotExists: true });
      expect(await queryInterface.nextval('big')).toBe('9007199254740993');
      await queryInterface.createSequence('owned', { ownedBy: { table: 'Seqs', column: 'name' } });
      await queryInterface.alterSequence('owned', { ownedBy: null, ifExists: true });
      await queryInterface.dropSequence('owned', { cascade: true });
    }));
});

describe('functions and triggers', () => {
  it('passes literal arguments, WHEN conditions and schema-qualified names to triggers', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE TABLE audit (id serial PRIMARY KEY, label text, n integer)');
      await sequelize.query('CREATE TABLE things (id serial PRIMARY KEY, v integer)');
      await queryInterface.createFunction(
        { name: 'Log Change', schema },
        [],
        'trigger',
        'plpgsql',
        'INSERT INTO audit (label, n) VALUES (TG_ARGV[0], TG_ARGV[1]::integer); RETURN NEW;',
        ['SECURITY INVOKER'],
      );
      await queryInterface.createTrigger(
        { tableName: 'things', schema },
        'things_log',
        'after',
        ['update'],
        { name: 'Log Change', schema },
        ["it's", 42],
        ['FOR EACH ROW', 'WHEN (OLD.v IS DISTINCT FROM NEW.v)'],
      );
      await sequelize.query('INSERT INTO things (v) VALUES (1)');
      await sequelize.query('UPDATE things SET v = 1');
      await sequelize.query('UPDATE things SET v = 2');
      expect(await select(sequelize, 'SELECT label, n FROM audit')).toEqual([
        { label: "it's", n: 42 },
      ]);
      await queryInterface.createTrigger(
        'things',
        'things_log',
        'after',
        ['update'],
        { name: 'Log Change', schema },
        [],
        ['FOR EACH STATEMENT'],
        { replace: true },
      );
      await queryInterface.dropTrigger('things', 'things_log');
      await queryInterface.dropTrigger('things', 'things_log', { ifExists: true });
      await queryInterface.dropFunction({ name: 'Log Change', schema }, [], { cascade: true });
    }));

  it('creates deferred constraint triggers', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE TABLE guarded (id serial PRIMARY KEY, v integer)');
      await queryInterface.createFunction(
        'must_be_positive',
        [],
        'trigger',
        'plpgsql',
        "IF NEW.v < 0 THEN RAISE EXCEPTION 'negative'; END IF; RETURN NULL;",
      );
      await queryInterface.createTrigger(
        'guarded',
        'guard',
        'after_constraint',
        ['insert'],
        'must_be_positive',
        [],
        ['DEFERRABLE', 'INITIALLY DEFERRED', 'FOR EACH ROW'],
      );
      await sequelize.transaction(async (transaction) => {
        await sequelize.query('INSERT INTO guarded (v) VALUES (1)', { transaction });
      });
      let inserted = false;
      await expect(
        sequelize.transaction(async (transaction) => {
          await sequelize.query('INSERT INTO guarded (v) VALUES (-1)', { transaction });
          inserted = true;
        }),
      ).rejects.toThrow(/negative/);
      expect(inserted).toBe(true);
    }));
});

describe('views and materialized views', () => {
  it('creates, replaces and drops views', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query(
        'CREATE TABLE items (id serial PRIMARY KEY, n integer, hidden boolean DEFAULT false)',
      );
      await sequelize.query('INSERT INTO items (n, hidden) VALUES (1, false), (2, true)');
      await queryInterface.createView(
        'visible_items',
        'SELECT id, n FROM items WHERE NOT hidden;',
        { columns: ['item_id', 'amount'] },
      );
      expect(await select(sequelize, 'SELECT * FROM visible_items')).toEqual([
        { item_id: 1, amount: 1 },
      ]);
      await queryInterface.createView(
        { tableName: 'visible_items', schema },
        'SELECT id AS item_id, n AS amount FROM items',
        { replace: true },
      );
      expect(await select(sequelize, 'SELECT count(*)::int AS c FROM visible_items')).toEqual([
        { c: 2 },
      ]);
      await queryInterface.dropView('visible_items');
      await queryInterface.dropView('visible_items', { ifExists: true });
      await expect(select(sequelize, 'SELECT * FROM visible_items')).rejects.toThrow(
        /does not exist/,
      );
    }));

  it('supports check options, recursive, security and temporary views', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE TABLE items (id serial PRIMARY KEY, n integer)');
      await queryInterface.createView('small', 'SELECT id, n FROM items WHERE n < 10', {
        checkOption: 'local',
        securityBarrier: true,
        securityInvoker: true,
      });
      await sequelize.query('INSERT INTO small (n) VALUES (5)');
      await expect(sequelize.query('INSERT INTO small (n) VALUES (50)')).rejects.toThrow(
        /check option/,
      );
      const options = await select<{ reloptions: string[] }>(
        sequelize,
        "SELECT reloptions FROM pg_class WHERE relname = 'small'",
      );
      expect((options[0]?.reloptions ?? []).toSorted()).toEqual([
        'check_option=local',
        'security_barrier=true',
        'security_invoker=true',
      ]);
      await queryInterface.createView(
        'counter',
        'SELECT 1 FROM (VALUES (1)) v UNION ALL SELECT n + 1 FROM counter WHERE n < 3',
        { recursive: true, columns: ['n'] },
      );
      expect(await select(sequelize, 'SELECT n FROM counter ORDER BY n')).toEqual([
        { n: 1 },
        { n: 2 },
        { n: 3 },
      ]);
      await sequelize.transaction(async (transaction) => {
        await queryInterface.createView('scratch', 'SELECT 1 AS one', {
          temporary: true,
          transaction,
        });
        const rows = await sequelize.query('SELECT * FROM scratch', {
          type: QueryTypes.SELECT,
          transaction,
        });
        expect(rows).toEqual([{ one: 1 }]);
      });
    }));

  it('creates, refreshes and drops materialized views', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await sequelize.query('CREATE TABLE items (id serial PRIMARY KEY, n integer)');
      await sequelize.query('INSERT INTO items (n) VALUES (1)');
      await queryInterface.createMaterializedView(
        'item_total',
        'SELECT 1 AS k, sum(n)::int AS total FROM items',
        { using: 'heap' },
      );
      await queryInterface.createMaterializedView('item_total', 'SELECT 1', { ifNotExists: true });
      await sequelize.query('CREATE UNIQUE INDEX item_total_k ON item_total (k)');
      await sequelize.query('INSERT INTO items (n) VALUES (4)');
      expect(await select(sequelize, 'SELECT total FROM item_total')).toEqual([{ total: 1 }]);
      await queryInterface.refreshMaterializedView('item_total', { concurrently: true });
      expect(await select(sequelize, 'SELECT total FROM item_total')).toEqual([{ total: 5 }]);
      await queryInterface.refreshMaterializedView(
        { tableName: 'item_total', schema },
        { withData: false },
      );
      await expect(select(sequelize, 'SELECT total FROM item_total')).rejects.toThrow(
        /not been populated/,
      );
      await queryInterface.refreshMaterializedView('item_total');
      await queryInterface.dropMaterializedView('item_total');
      await queryInterface.dropMaterializedView('item_total', { ifExists: true });
      await queryInterface.createMaterializedView('empty_view', 'SELECT 1 AS a', {
        columns: ['b'],
        withData: false,
      });
      await queryInterface.dropMaterializedView('empty_view', { cascade: true });
    }));
});

describe('row-level security', () => {
  it('enforces policies for a non-owner role', () =>
    withSchema(async ({ schema, client }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      const role = `pgz_rls_${schema}`;
      await client.query(`CREATE ROLE "${role}" NOLOGIN`);
      try {
        await sequelize.query(
          'CREATE TABLE docs (id serial PRIMARY KEY, tenant_id integer, title text)',
        );
        await sequelize.query("INSERT INTO docs (tenant_id, title) VALUES (1, 'a'), (2, 'b')");
        await client.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
        await client.query(`GRANT ALL ON docs TO "${role}"`);
        await queryInterface.enableRowLevelSecurity('docs', { force: true });
        await queryInterface.createPolicy('docs', 'tenant_isolation', {
          roles: [role],
          using: "tenant_id = current_setting('app.tenant_id')::int",
          withCheck: "tenant_id = current_setting('app.tenant_id')::int",
        });
        const visible = (tenant: number) =>
          sequelize.transaction(
            { settings: { 'app.tenant_id': String(tenant) } },
            async (transaction) => {
              await sequelize.query(`SET LOCAL ROLE "${role}"`, { transaction });
              return await sequelize.query('SELECT title FROM docs', {
                type: QueryTypes.SELECT,
                transaction,
              });
            },
          );
        expect(await visible(1)).toEqual([{ title: 'a' }]);
        expect(await visible(2)).toEqual([{ title: 'b' }]);
        await queryInterface.alterPolicy('docs', 'tenant_isolation', {
          using: { tenant_id: 1 },
          withCheck: { tenant_id: 1 },
        });
        expect(await visible(2)).toEqual([{ title: 'a' }]);
        await queryInterface.alterPolicy('docs', 'tenant_isolation', { rename: 'only_one' });
        await queryInterface.createPolicy({ tableName: 'docs', schema }, 'no_deletes', {
          kind: 'restrictive',
          command: 'delete',
          using: 'false',
        });
        const names = await select<{ policyname: string }>(
          sequelize,
          `SELECT policyname FROM pg_policies WHERE schemaname = '${schema}' ORDER BY 1`,
        );
        expect(names.map((row) => row.policyname)).toEqual(['no_deletes', 'only_one']);
        await queryInterface.dropPolicy('docs', 'no_deletes');
        await queryInterface.dropPolicy('docs', 'no_deletes', { ifExists: true });
        await queryInterface.dropPolicy('docs', 'only_one', { cascade: true });
        await queryInterface.disableRowLevelSecurity('docs', { noForce: true });
        const flags = await select<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          sequelize,
          "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'docs'",
        );
        expect(flags).toEqual([{ relrowsecurity: false, relforcerowsecurity: false }]);
      } finally {
        await client.query(`DROP OWNED BY "${role}"`);
        await client.query(`DROP ROLE "${role}"`);
      }
    }));
});

const persistence = async (
  sequelize: Sequelize,
  table: string,
  transaction?: Transaction,
): Promise<string[]> => {
  const rows = (await sequelize.query(
    `SELECT relpersistence FROM pg_class WHERE relname = '${table}'`,
    {
      type: QueryTypes.SELECT,
      ...(transaction === undefined ? {} : { transaction }),
    },
  )) as { relpersistence: string }[];
  return rows.map((row) => row.relpersistence);
};

describe('unlogged and temporary tables', () => {
  it('creates unlogged tables with createTable and with models', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      await sequelize
        .getQueryInterface()
        .createTable('fast_log', { msg: DataTypes.TEXT }, { unlogged: true });
      const Cache = sequelize.define(
        'Cache',
        { k: DataTypes.TEXT },
        { tableName: 'cache', unlogged: true },
      );
      const Plain = sequelize.define('Plain', { k: DataTypes.TEXT }, { tableName: 'plain' });
      await sequelize.sync();
      expect(await persistence(sequelize, 'fast_log')).toEqual(['u']);
      expect(await persistence(sequelize, 'cache')).toEqual(['u']);
      expect(await persistence(sequelize, 'plain')).toEqual(['p']);
      await Cache.create({ k: 'a' });
      expect(await Cache.count()).toBe(1);
      expect(await Plain.count()).toBe(0);
    }));

  it('creates temporary tables that live in one session', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Scratch = sequelize.define(
        'Scratch',
        { n: DataTypes.INTEGER },
        { tableName: 'scratch', temporary: true, timestamps: false },
      );
      await sequelize.transaction(async (transaction) => {
        await sequelize
          .getQueryInterface()
          .createTable('tmp_one', { n: DataTypes.INTEGER }, { temporary: true, transaction });
        await Scratch.sync({ transaction });
        await Scratch.create({ n: 1 }, { transaction });
        expect(await Scratch.count({ transaction })).toBe(1);
        expect(await persistence(sequelize, 'scratch', transaction)).toEqual(['t']);
        expect(await persistence(sequelize, 'tmp_one', transaction)).toEqual(['t']);
      });
      await expect(
        sequelize.getQueryInterface().createTable('bad', {}, { temporary: true, unlogged: true }),
      ).rejects.toThrow(/both/);
    }));
});
