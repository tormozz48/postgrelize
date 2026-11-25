import { expect, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';
import { TestNamespace } from '../support/cls-namespace.ts';

// With CLS, hooks of every operation get the ambient transaction in their `options`, like v6 (which
// puts it into the options before it runs any hook).
type HookModel = {
  addHook(type: string, name: string, fn: (...args: unknown[]) => void): void;
};

const TYPES = [
  'beforeFind',
  'afterFind',
  'beforeCount',
  'beforeValidate',
  'afterValidate',
  'beforeCreate',
  'afterCreate',
  'beforeSave',
  'afterSave',
  'beforeUpdate',
  'afterUpdate',
  'beforeDestroy',
  'afterDestroy',
  'beforeBulkCreate',
  'afterBulkCreate',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeUpsert',
  'afterUpsert',
  'beforeRestore',
  'afterRestore',
];

it('hooks of every operation see the ambient transaction in options.transaction', async () => {
  const result = (await expectSameResult('', async (lib, sequelize) => {
    lib.Sequelize.useCLS(new TestNamespace());
    const M = sequelize.define('HM', {
      name: { type: lib.DataTypes.STRING, unique: true },
      n: lib.DataTypes.INTEGER,
    });
    const P = sequelize.define('HP', { name: lib.DataTypes.STRING }, { paranoid: true });
    await sequelize.sync({ force: true });
    const seen: Record<string, boolean> = {};
    let current = '';
    let outer: unknown;
    for (const type of TYPES) {
      for (const model of [M, P] as unknown as HookModel[]) {
        model.addHook(type, `probe-${type}`, (...args) => {
          const options = args.at(-1) as { transaction?: unknown } | undefined;
          seen[`${current} ${type}`] = options?.transaction === outer;
        });
      }
    }
    await sequelize.transaction(async (t) => {
      outer = t;
      const row = await M.create({ name: 'a', n: 1 } as never);
      const steps: [string, () => Promise<unknown>][] = [
        ['findAll', () => M.findAll()],
        ['findOne', () => M.findOne()],
        ['findByPk', () => M.findByPk(1)],
        ['count', () => M.count()],
        ['create', () => M.create({ name: 'b', n: 2 } as never)],
        [
          'bulkCreate',
          () => M.bulkCreate([{ name: 'c', n: 3 }] as never, { individualHooks: true }),
        ],
        [
          'update',
          () => M.update({ n: 9 } as never, { where: { name: 'c' }, individualHooks: true }),
        ],
        ['upsert', () => M.upsert({ name: 'a', n: 7 } as never)],
        ['instance.update', () => row.update({ n: 6 } as never)],
        ['instance.reload', () => row.reload()],
        ['instance.destroy', () => row.destroy()],
        ['destroy', () => M.destroy({ where: { name: 'c' }, individualHooks: true })],
        ['findAndCountAll', () => M.findAndCountAll()],
        ['sum', () => M.sum('n')],
      ];
      for (const [name, step] of steps) {
        current = name;
        await step();
      }
      const p = await P.create({ name: 'p' } as never);
      for (const [name, step] of [
        ['paranoid destroy', () => p.destroy()],
        ['instance.restore', () => p.restore()],
      ] as [string, () => Promise<unknown>][]) {
        current = name;
        await step();
      }
    });
    return seen;
  })) as Record<string, boolean>;
  expect(Object.keys(result).length).toBeGreaterThan(40);
  expect(Object.entries(result).filter(([, same]) => !same)).toEqual([]);
});
