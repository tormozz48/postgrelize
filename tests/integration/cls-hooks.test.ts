import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize, type Transaction } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// `Sequelize.useCLS()` (AsyncLocalStorage): hooks get the ambient transaction in `options.transaction`.
const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

Sequelize.useCLS();

const connect = (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  return sequelize;
};

describe('ambient transaction in hook options', () => {
  it('afterFind sees it and a follow-up query with it sees the uncommitted rows', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Doc = sequelize.define('Doc', { name: DataTypes.STRING });
      await sequelize.sync();
      let seen: unknown;
      let followUp = -1;
      Doc.addHook('afterFind', async (_result: unknown, options: { transaction?: Transaction }) => {
        seen = options.transaction;
        followUp = await Doc.count({ transaction: options.transaction ?? null });
      });
      let outer: Transaction | undefined;
      await sequelize.transaction(async (t) => {
        outer = t;
        await Doc.create({ name: 'uncommitted' });
        await Doc.findAll();
      });
      expect(seen).toBe(outer);
      expect(followUp).toBe(1);
    }));

  it('every operation hands the ambient transaction to its hooks, and an explicit null is respected', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Doc = sequelize.define('Doc', { name: DataTypes.STRING });
      await sequelize.sync();
      const seen = new Map<string, unknown>();
      let step = '';
      for (const type of [
        'beforeFind',
        'beforeCount',
        'beforeCreate',
        'afterCreate',
        'beforeBulkCreate',
        'beforeBulkUpdate',
        'beforeBulkDestroy',
        'beforeUpdate',
        'beforeDestroy',
      ] as const) {
        Doc.addHook(type, `probe-${type}`, (...args: unknown[]) => {
          seen.set(`${step} ${type}`, (args.at(-1) as { transaction?: unknown }).transaction);
        });
      }
      let outer: Transaction | undefined;
      await sequelize.transaction(async (t) => {
        outer = t;
        const doc = await Doc.create({ name: 'a' });
        const steps: [string, () => Promise<unknown>][] = [
          ['findAll', () => Doc.findAll()],
          ['count', () => Doc.count()],
          ['bulkCreate', () => Doc.bulkCreate([{ name: 'b' }])],
          ['update', () => Doc.update({ name: 'c' }, { where: { name: 'b' } })],
          ['instance.update', () => doc.update({ name: 'd' })],
          ['instance.destroy', () => doc.destroy()],
          ['destroy', () => Doc.destroy({ where: {} })],
          ['findAll null', () => Doc.findAll({ transaction: null })],
        ];
        for (const [name, run] of steps) {
          step = name;
          await run();
        }
      });
      const wrong = [...seen].filter(([key, value]) =>
        key.startsWith('findAll null') ? value !== null : value !== outer,
      );
      expect(seen.size).toBeGreaterThan(8);
      expect(wrong).toEqual([]);
    }));
});
