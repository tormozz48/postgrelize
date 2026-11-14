import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Model,
  Op,
  Sequelize,
  col,
  excluded,
  fn,
  literal,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const TABLE = `
  CREATE TABLE counters (
    id SERIAL PRIMARY KEY,
    tenant TEXT NOT NULL,
    key TEXT NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    tags TEXT[] NOT NULL DEFAULT '{}',
    email TEXT,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT counters_tenant_key UNIQUE (tenant, key)
  );
  CREATE UNIQUE INDEX counters_email_lower ON counters (lower(email));
  CREATE UNIQUE INDEX counters_active_key ON counters (key) WHERE NOT archived;`;

class Counter extends Model<InferAttributes<Counter>, InferCreationAttributes<Counter>> {
  declare id: CreationOptional<number>;
  declare tenant: string;
  declare key: string;
  declare hits: CreationOptional<number>;
  declare version: CreationOptional<number>;
  declare tags: CreationOptional<string[]>;
  declare email: CreationOptional<string | null>;
  declare archived: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const logged: string[] = [];

const withCounters = <T>(run: () => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query(TABLE);
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: (sql) => logged.push(sql),
      define: { underscored: true },
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    Counter.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        tenant: { type: DataTypes.TEXT, allowNull: false },
        key: { type: DataTypes.TEXT, allowNull: false },
        hits: { type: DataTypes.INTEGER, defaultValue: 0 },
        version: { type: DataTypes.INTEGER, defaultValue: 1 },
        tags: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
        email: DataTypes.TEXT,
        archived: { type: DataTypes.BOOLEAN, defaultValue: false },
      },
      { sequelize, tableName: 'counters' },
    );
    await Counter.bulkCreate([
      { tenant: 't1', key: 'a', hits: 1, version: 1, tags: ['x'], email: 'A@x.io' },
      { tenant: 't1', key: 'b', hits: 2, version: 5 },
    ]);
    return run();
  });

const snapshot = async () =>
  (await Counter.findAll({ order: [['id', 'ASC']] })).map(
    ({ tenant, key, hits, version, tags, email, archived }) => ({
      tenant,
      key,
      hits,
      version,
      tags,
      email,
      archived,
    }),
  );

describe('onConflict', () => {
  it('increments with an expression and reports inserted/updated rows', () =>
    withCounters(async () => {
      const rows = await Counter.insert(
        [
          { tenant: 't1', key: 'a', hits: 10 },
          { tenant: 't1', key: 'c', hits: 3 },
        ],
        {
          onConflict: {
            target: ['tenant', 'key'],
            action: { update: { hits: literal('"Counter"."hits" + EXCLUDED."hits"') } },
          },
        },
      );
      expect(rows.map((row) => [row.key, row.hits, row.wasInserted])).toEqual([
        ['a', 11, false],
        ['c', 3, true],
      ]);
      expect(rows[0]).toBeInstanceOf(Counter);
      expect(rows[0]?.toJSON()).not.toHaveProperty('__pgz_inserted');
      expect(logged.at(-1)).toContain(
        'INSERT INTO "counters" AS "Counter" ("tenant", "key", "hits", "version", "tags", "archived", "created_at", "updated_at")',
      );
      expect(logged.at(-1)).toContain(
        'ON CONFLICT ("tenant", "key") DO UPDATE SET "hits" = "Counter"."hits" + EXCLUDED."hits", "updated_at" = EXCLUDED."updated_at"',
      );
    }));

  it('updates only when the incoming version is newer (DO UPDATE ... WHERE)', () =>
    withCounters(async () => {
      const rows = await Counter.insert(
        [
          { tenant: 't1', key: 'a', hits: 100, version: 2 },
          { tenant: 't1', key: 'b', hits: 100, version: 3 },
        ],
        {
          onConflict: {
            target: ['tenant', 'key'],
            action: {
              update: ['hits', 'version'],
              where: { version: { [Op.lt]: excluded('version') } },
            },
          },
        },
      );
      expect(rows.map((row) => row.key)).toEqual(['a']);
      expect((await snapshot()).map((row) => [row.key, row.hits, row.version])).toEqual([
        ['a', 100, 2],
        ['b', 2, 5],
      ]);
    }));

  it('targets a named constraint and appends with fn()', () =>
    withCounters(async () => {
      await Counter.bulkCreate([{ tenant: 't1', key: 'a', tags: ['y'] }], {
        onConflict: {
          target: { constraint: 'counters_tenant_key' },
          action: { update: { tags: fn('array_cat', col('Counter.tags'), excluded('tags')) } },
        },
      });
      expect((await snapshot())[0]?.tags).toEqual(['x', 'y']);
    }));

  it('targets an expression index', () =>
    withCounters(async () => {
      const [row] = await Counter.insert(
        { tenant: 't2', key: 'z', email: 'a@X.IO', hits: 7 },
        { onConflict: { target: [fn('lower', col('email'))], action: { update: ['hits'] } } },
      );
      expect([row?.key, row?.hits, row?.wasInserted]).toEqual(['a', 7, false]);
    }));

  it('targets a partial unique index', () =>
    withCounters(async () => {
      const [row] = await Counter.insert(
        { tenant: 't9', key: 'b', hits: 50 },
        {
          onConflict: {
            target: { columns: ['key'], where: { archived: false } },
            action: { update: { hits: excluded('hits') } },
          },
        },
      );
      expect([row?.tenant, row?.hits, row?.wasInserted]).toEqual(['t1', 50, false]);
    }));

  it('DO NOTHING returns only inserted rows', () =>
    withCounters(async () => {
      const rows = await Counter.bulkCreate(
        [
          { tenant: 't1', key: 'a' },
          { tenant: 't1', key: 'n' },
        ],
        { onConflict: { action: 'nothing' } },
      );
      expect(rows.map((row) => [row.key, row.wasInserted])).toEqual([['n', true]]);
    }));

  it('create with onConflict returns the stored row, or the unsaved instance when skipped', () =>
    withCounters(async () => {
      const updated = await Counter.create(
        { tenant: 't1', key: 'b', hits: 9 },
        { onConflict: { target: ['tenant', 'key'], action: { update: ['hits'] } } },
      );
      expect([updated.id, updated.hits, updated.wasInserted, updated.isNewRecord]).toEqual([
        2,
        9,
        false,
        false,
      ]);
      const skipped = await Counter.create(
        { tenant: 't1', key: 'b' },
        { onConflict: { target: ['tenant', 'key'], action: 'nothing' } },
      );
      expect([skipped.wasInserted, skipped.isNewRecord]).toEqual([false, true]);
    }));

  it('upsert with onConflict returns [instance, created]', () =>
    withCounters(async () => {
      const [first, created] = await Counter.upsert(
        { tenant: 't3', key: 'k', hits: 1 },
        {
          onConflict: {
            target: ['tenant', 'key'],
            action: { update: { hits: literal('"Counter"."hits" + 1') } },
          },
        },
      );
      const [second, createdAgain] = await Counter.upsert(
        { tenant: 't3', key: 'k', hits: 1 },
        {
          onConflict: {
            target: ['tenant', 'key'],
            action: { update: { hits: literal('"Counter"."hits" + 1') } },
          },
        },
      );
      expect([first.hits, created, second.hits, createdAgain]).toEqual([1, true, 2, false]);
    }));

  it('validates options before running a query', () =>
    withCounters(async () => {
      const count = logged.length;
      await expect(
        Counter.insert({ tenant: 't', key: 'k' }, { onConflict: { action: { update: ['hits'] } } }),
      ).rejects.toThrow(/target is required/);
      await expect(
        Counter.insert(
          { tenant: 't', key: 'k' },
          { onConflict: { target: ['nope' as 'key'], action: 'nothing' } },
        ),
      ).rejects.toThrow(/unknown attribute "nope"/);
      await expect(
        Counter.insert(
          { tenant: 't', key: 'k' },
          { onConflict: { target: ['key'], action: { update: [] } } },
        ),
      ).rejects.toThrow(/at least one attribute/);
      await expect(
        Counter.bulkCreate([{ tenant: 't', key: 'k' }], {
          ignoreDuplicates: true,
          onConflict: { action: 'nothing' },
        }),
      ).rejects.toThrow(/cannot be combined/);
      await expect(Counter.findAll({ where: { hits: excluded('hits') as never } })).rejects.toThrow(
        /only be used inside onConflict/,
      );
      expect(logged.length).toBe(count);
    }));
});
