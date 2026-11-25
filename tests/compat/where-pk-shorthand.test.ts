import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const outcome = (run: () => Promise<unknown>): Promise<unknown> =>
  Promise.resolve()
    .then(run)
    .then(
      (value) => value,
      (error: Error) => `${error.name}: ${error.message}`,
    );

const SHORTHANDS: readonly [string, unknown][] = [
  ['number', 1],
  ['bigint', 2n],
  ['missing number', 99],
  ['null', null],
  ['numeric string', '1'],
  ['plain string', 'x'],
];

describe('compat: primitive where (primary key shorthand)', () => {
  for (const [paranoid, label] of [
    [false, 'plain'],
    [true, 'paranoid'],
  ] as const) {
    it(`finders, count, update, destroy, restore on a ${label} model`, () =>
      expectSameResult('', async (lib, sequelize) => {
        const User = sequelize.define('User', { name: lib.DataTypes.STRING }, { paranoid });
        await sequelize.sync({ force: true });
        await User.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
        const out: Record<string, unknown> = {};
        const scope = { paranoid: false };
        for (const [name, where] of SHORTHANDS) {
          const options = { where: where as never, ...scope };
          out[`findAll ${name}`] = await outcome(async () =>
            (await User.findAll({ ...options, order: [['id', 'ASC']] })).map((u) => u.get('name')),
          );
          out[`findOne ${name}`] = await outcome(async () =>
            (await User.findOne({ ...options, order: [['id', 'ASC']] }))?.get('name'),
          );
          out[`count ${name}`] = await outcome(() => User.count(options));
          out[`update ${name}`] = await outcome(() => User.update({ name: 'z' }, options));
          out[`destroy ${name}`] = await outcome(() => User.destroy(options));
          out[`restore ${name}`] = await outcome(async () => {
            await User.restore(options);
          });
        }
        out['rows'] = (await User.findAll({ paranoid: false, order: [['id', 'ASC']] })).map((u) => [
          u.get('id'),
          u.get('name'),
        ]);
        return out;
      }));
  }
});
