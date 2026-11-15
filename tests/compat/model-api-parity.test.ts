import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Notes" (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    qty INTEGER,
    version INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ
  );
  DROP SCHEMA IF EXISTS tenant CASCADE;
  CREATE SCHEMA tenant;
  CREATE TABLE tenant."Notes" (LIKE "Notes" INCLUDING ALL);
  INSERT INTO "Notes" (title, qty, "createdAt", "updatedAt") VALUES ('public', 1, now(), now());
  INSERT INTO tenant."Notes" (title, qty, "createdAt", "updatedAt") VALUES ('tenant', 5, now(), now());
  INSERT INTO tenant."Notes" (title, qty, "createdAt", "updatedAt") VALUES ('tenant2', 7, now(), now());`;

const define = (lib: Lib, sequelize: Sequelize, options: object = {}) =>
  sequelize.define(
    'Note',
    {
      title: { type: lib.DataTypes.STRING, allowNull: false },
      qty: lib.DataTypes.INTEGER,
    },
    { paranoid: true, version: true, ...options },
  );

const table = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? { ...value, toString: String(value) } : value;

const stamped = (row: { get: (key: string) => unknown }) => ({
  title: row.get('title'),
  qty: row.get('qty'),
  createdAt: row.get('createdAt') instanceof Date,
  updatedAt: row.get('updatedAt') instanceof Date,
  version: row.get('version'),
});

describe('compat: create / bulkCreate with an explicit fields list', () => {
  it('create adds timestamps and the version to the listed fields', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize);
      const created = await Note.create({ title: 'a', qty: 3 }, { fields: ['title'] });
      const stored = await Note.findOne({ where: { title: 'a' } });
      return { created: stamped(created), stored: stamped(stored as never) };
    }));

  it('create skips unlisted attributes', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, { paranoid: false, timestamps: true });
      const created = await Note.create({ title: 'b', qty: 9 }, { fields: ['title'] });
      return { qty: (await Note.findByPk(created.get('id') as number))?.get('qty') };
    }));

  it('create on a model without timestamps', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Plain = sequelize.define(
        'Note',
        { title: lib.DataTypes.STRING, qty: lib.DataTypes.INTEGER },
        { tableName: 'Notes', timestamps: false },
      );
      return Plain.sequelize !== undefined;
    }));

  it('bulkCreate adds timestamps to the listed fields', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize);
      const rows = await Note.bulkCreate(
        [
          { title: 'x', qty: 1 },
          { title: 'y', qty: 2 },
        ],
        { fields: ['title'] },
      );
      const stored = await Note.findAll({
        where: { title: ['x', 'y'] },
        order: [['title', 'ASC']],
      });
      return { rows: rows.map(stamped), stored: stored.map(stamped) };
    }));

  it('save with fields on a loaded instance writes updatedAt and the version', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize);
      const note = (await Note.findOne({ where: { title: 'public' } })) as never as InstanceType<
        typeof Note
      >;
      note.set('title', 'renamed');
      note.set('qty', 99);
      await note.save({ fields: ['title'] });
      const stored = await Note.findOne({ where: { title: 'renamed' } });
      return stamped(stored as never);
    }));
});

describe('compat: set back to the stored value', () => {
  it('changed() after set-back and the columns save() writes', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, { paranoid: false });
      const note = (await Note.findOne({ where: { title: 'public' } })) as never as InstanceType<
        typeof Note
      >;
      note.set('qty', 2);
      note.set('qty', 1);
      note.setDataValue('title', 'tmp');
      note.setDataValue('title', 'public');
      const afterSetBack = { changed: note.changed(), previousQty: note.previous('qty') };
      note.changed('qty', false);
      note.changed('title', false);
      note.set('title', 'public');
      return { afterSetBack, clean: note.changed() };
    }));

  it('set of an unchanged value leaves the instance clean; save skips an UPDATE', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, { paranoid: false });
      const note = (await Note.findOne({ where: { title: 'public' } })) as never as InstanceType<
        typeof Note
      >;
      note.set('qty', 1);
      const log: string[] = [];
      await note.save({ logging: (sql: string) => void log.push(sql.split(' ')[0] ?? '') });
      return { changed: note.changed(), log };
    }));
});

describe('compat: aggregate results', () => {
  it('plain: false returns the raw rows', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, { schema: 'tenant' });
      return {
        sum: await Note.aggregate('qty', 'sum', { plain: false }),
        grouped: await Note.aggregate('qty', 'sum', {
          plain: false,
          group: ['title'],
          order: [['title', 'ASC']],
        } as never),
        count: await Note.aggregate('*', 'count', { plain: false }),
      };
    }));

  it('plain results follow the attribute type and the dataType option', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, { schema: 'tenant' });
      return {
        sum: await Note.sum('qty'),
        max: await Note.max('qty'),
        star: await Note.aggregate('*', 'count', {}),
        asFloat: await Note.aggregate('qty', 'sum', { dataType: lib.DataTypes.FLOAT }),
        asText: await Note.aggregate('qty', 'max', { dataType: lib.DataTypes.STRING }),
        empty: await Note.max('qty', { where: { title: 'none' } }),
      };
    }));
});

describe('compat: Model.schema', () => {
  it('queries through the bound model hit the schema', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, { paranoid: false });
      const Tenant = Note.schema('tenant');
      const created = await Tenant.create({ title: 'new', qty: 1 });
      return {
        tenant: (await Tenant.findAll({ order: [['title', 'ASC']] })).map((row) =>
          row.get('title'),
        ),
        pub: (await Note.findAll()).map((row) => row.get('title')),
        count: await Tenant.count(),
        sum: await Tenant.sum('qty'),
        isInstance: created instanceof Note,
        table: table(Tenant.getTableName()),
        original: table(Note.getTableName()),
        name: Tenant.name,
      };
    }));

  it('delimiter option and scoped state are preserved', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Note = define(lib, sequelize, {
        paranoid: false,
        scopes: { big: { where: { qty: { [lib.Op.gte]: 6 } } } },
      });
      const scoped = Note.scope('big').schema('tenant');
      const unscoped = Note.schema('tenant', { schemaDelimiter: '_' }).unscoped();
      return {
        scoped: (await scoped.findAll()).map((row) => row.get('title')),
        table: table(unscoped.getTableName()),
        viaString: table(Note.schema('tenant', '-').getTableName()),
      };
    }));
});
