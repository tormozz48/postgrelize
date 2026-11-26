import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const outcome = async (run: () => Promise<unknown>): Promise<unknown> =>
  run().then(
    (value) => value,
    (error: Error) => [error.name, error.message],
  );

describe('compat: Model.update arguments', () => {
  it('drops undefined and unknown values and reports a missing where', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER, STRING } = lib.DataTypes;
      const statements: string[] = [];
      const Account = sequelize.define('Account', {
        ownerId: { type: INTEGER, allowNull: false },
        name: STRING,
      });
      const Bare = sequelize.define('Bare', { name: STRING }, { timestamps: false });
      await sequelize.sync({ force: true });
      await Account.create({ ownerId: 3 });
      await Bare.create({ name: 'a' });
      const logging = (sql: string): void => void statements.push(sql);
      const where = { where: {} };
      const update = Account.update.bind(Account) as (...args: unknown[]) => Promise<unknown>;
      return [
        await outcome(() => update({ name: 'q', ownerId: undefined }, where)),
        await outcome(() => update({ unknownField: 'h' }, { ...where, logging })),
        await outcome(() => Bare.update({ nope: 1 } as never, { ...where, logging })),
        await outcome(() => Bare.update({}, { ...where, logging })),
        statements.length,
        await outcome(() => update()),
        await outcome(() => update({ name: 'x' })),
        (await Account.findAll()).map((row) => [row.get('ownerId'), row.get('name')]),
      ];
    }));
});
