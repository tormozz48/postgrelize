import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Us" (id SERIAL PRIMARY KEY, status TEXT, name TEXT, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now(), "deletedAt" TIMESTAMPTZ);
  INSERT INTO "Us" (status, name) VALUES ('a','x'),('a','y');
`;

type Opts = { fields?: unknown; attributes?: Record<string, unknown>; individualHooks?: boolean };

const run = (
  scenario: (U: ReturnType<Sequelize['define']>, seen: unknown[], lib: Lib) => Promise<unknown>,
  options: object = {},
) =>
  expectSameResult(TABLES, async (lib, sequelize) => {
    const U = sequelize.define(
      'U',
      { status: lib.DataTypes.STRING, name: lib.DataTypes.STRING },
      options,
    );
    const seen: unknown[] = [];
    return { result: await scenario(U, seen, lib), seen };
  });

const record = (seen: unknown[]) => (o: Opts) => {
  seen.push({ fields: o.fields, attributes: Object.keys(o.attributes ?? {}).toSorted() });
};

describe('compat: options seen by beforeBulkUpdate', () => {
  it('fields lists the updated attributes (and updatedAt)', () =>
    run(async (U, seen) => {
      U.addHook('beforeBulkUpdate', record(seen));
      return U.update({ status: 'b' }, { where: {} });
    }));

  it('fields lists only the keys of values', () =>
    run(async (U, seen) => {
      U.addHook('beforeBulkUpdate', record(seen));
      return U.update({ status: 'b', name: 'z' }, { where: {} });
    }));

  it('a model without timestamps', () =>
    run(
      async (U, seen) => {
        U.addHook('beforeBulkUpdate', record(seen));
        return U.update({ status: 'b' }, { where: {} });
      },
      { timestamps: false },
    ));

  it('an explicit fields option is preserved', () =>
    run(async (U, seen) => {
      U.addHook('beforeBulkUpdate', record(seen));
      return U.update({ status: 'b', name: 'z' }, { where: {}, fields: ['status'] });
    }));

  it('a hook sets individualHooks and afterUpdate runs per row', () =>
    run(async (U, seen) => {
      U.addHook('beforeBulkUpdate', (o: Opts) => {
        record(seen)(o);
        o.individualHooks = true;
      });
      U.addHook('afterUpdate', () => {
        seen.push('afterUpdate');
      });
      return U.update({ status: 'b' }, { where: {} });
    }));

  it('a hook that narrows fields takes effect', () =>
    run(async (U) => {
      U.addHook('beforeBulkUpdate', (o: Opts) => {
        o.fields = ['status'];
      });
      await U.update({ status: 'b', name: 'z' }, { where: {} });
      return (await U.findAll({ order: [['id', 'ASC']], raw: true })).map((row) => ({
        status: row['status' as never],
        name: row['name' as never],
      }));
    }));

  it('a hook that edits attributes takes effect', () =>
    run(async (U) => {
      U.addHook('beforeBulkUpdate', (o: Opts) => {
        o.attributes = { ...o.attributes, name: 'hooked' };
      });
      await U.update({ status: 'b' }, { where: {} });
      return (await U.findAll({ order: [['id', 'ASC']], raw: true })).map((row) => ({
        status: row['status' as never],
        name: row['name' as never],
      }));
    }));

  it('beforeBulkDestroy and beforeBulkRestore options carry no fields or attributes', () =>
    run(
      async (U, seen) => {
        U.addHook('beforeBulkDestroy', record(seen));
        U.addHook('beforeBulkRestore', record(seen));
        await U.destroy({ where: {} });
        await U.restore({ where: {} });
        return null;
      },
      { paranoid: true },
    ));
});
