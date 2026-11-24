import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Us" (id SERIAL PRIMARY KEY, status TEXT, name TEXT, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
`;

// The slice of a model instance the scenarios use (the two libraries share it).
type Inst = {
  [attribute: string]: unknown;
  isNewRecord: boolean;
  changed(key?: string): unknown;
  previous(key: string): unknown;
  get(key: string): unknown;
  set(values: object | string, value?: unknown): unknown;
  save(options?: object): Promise<unknown>;
  update(values: object): Promise<unknown>;
};

const create = async (U: ReturnType<Sequelize['define']>, values: object): Promise<Inst> =>
  (await U.create(values)) as unknown as Inst;

const build = (U: ReturnType<Sequelize['define']>, values: object): Inst =>
  U.build(values) as unknown as Inst;

type Seen = { hook: string; changed: unknown; previous: unknown; status: unknown; isNew: unknown };

const run = (
  scenario: (U: ReturnType<Sequelize['define']>, seen: Seen[], lib: Lib) => Promise<unknown>,
  hooks: readonly string[] = ['afterCreate', 'afterUpdate', 'afterSave'],
) =>
  expectSameResult(TABLES, async (lib, sequelize) => {
    const U = sequelize.define('U', {
      status: lib.DataTypes.STRING,
      name: lib.DataTypes.STRING,
    });
    const seen: Seen[] = [];
    for (const hook of hooks) {
      U.addHook(hook as 'afterCreate', `h-${hook}`, (instance: Inst) => {
        seen.push({
          hook,
          changed: instance.changed(),
          previous: instance.previous('status'),
          status: instance.get('status'),
          isNew: instance.isNewRecord,
        });
      });
    }
    const result = await scenario(U, seen, lib);
    return { result, seen };
  });

const after = (u: Inst) => ({ changed: u.changed(), previous: u.previous('status') });

describe('compat: instance state inside after hooks (v6 save order)', () => {
  it('update()', () =>
    run(async (U, seen) => {
      const u = await create(U, { status: 'invited' });
      seen.length = 0;
      await u.update({ status: 'active' });
      return after(u);
    }));

  it('save() after a direct assignment through set()', () =>
    run(async (U, seen) => {
      const u = await create(U, { status: 'invited', name: 'a' });
      seen.length = 0;
      u.set('status', 'active');
      u.set('name', 'b');
      await u.save();
      return after(u);
    }));

  it('save() after a property assignment', () =>
    run(async (U, seen) => {
      const u = await create(U, { status: 'invited' });
      seen.length = 0;
      u.status = 'active';
      await u.save();
      return after(u);
    }));

  it('create() reports every set field as changed in afterCreate', () =>
    run(async (U) => {
      const u = await create(U, { status: 'invited', name: 'a' });
      return after(u);
    }));

  it('build().save()', () =>
    run(async (U) => {
      const u = build(U, { status: 'invited' });
      await u.save();
      return after(u);
    }));

  it('save() with fields', () =>
    run(async (U, seen) => {
      const u = await create(U, { status: 'invited', name: 'a' });
      seen.length = 0;
      u.set({ status: 'active', name: 'b' });
      await u.save({ fields: ['status'] });
      return { ...after(u), name: u.changed('name') };
    }));

  it('bulk update with individualHooks', () =>
    run(async (U, seen) => {
      await U.bulkCreate([{ status: 'invited' }, { status: 'invited' }]);
      seen.length = 0;
      const [count] = await U.update({ status: 'active' }, { where: {}, individualHooks: true });
      return count;
    }));

  it('a hook sees the state, later reads see it reset', () =>
    run(async (U, seen) => {
      const u = await create(U, { status: 'invited' });
      u.status = 'active';
      await u.save();
      u.status = 'done';
      await u.save();
      return { ...after(u), n: seen.length };
    }));

  it('an after hook that throws leaves the state unreset', () =>
    run(async (U) => {
      const u = await create(U, { status: 'invited' });
      U.addHook('afterUpdate', 'boom', () => {
        throw new Error('boom');
      });
      u.status = 'active';
      const error = await u.save().catch((caught: Error) => caught.message);
      return { error, ...after(u) };
    }, []));
});
