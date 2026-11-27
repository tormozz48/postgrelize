import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

// the statement texts differ between the libraries: compare what the logger can be relied on for
const shape = (line: string) => ({
  placeholders: line.includes('$1'),
  value: line.includes("'ann'"),
  parameters: /; .*"ann"/.test(line),
});

describe('compat: logged statements', () => {
  it.each([false, true])(
    'shows placeholders where v6 does, logQueryParameters %s',
    async (logQueryParameters) => {
      await expectSameResult('', async (lib, sequelize) => {
        const User = sequelize.define('User', { name: lib.DataTypes.STRING });
        await sequelize.sync();
        const lines: string[] = [];
        const options = { logQueryParameters, logging: (line: string) => lines.push(line) };
        const user = await User.create({ name: 'ann' }, options);
        await user.update({ name: 'bob' }, options);
        await User.update({ name: 'ann' }, { where: { id: 1 }, ...options });
        await User.findAll({ where: { name: 'ann' }, ...options });
        await sequelize.query('SELECT $1::text AS a', { bind: ['ann'], ...options });
        return lines.map(shape);
      });
    },
  );

  it('logs a failing statement', () =>
    expectSameResult('', async (_lib, sequelize) => {
      let count = 0;
      await sequelize
        .query('SELECT * FROM missing', { logging: () => (count += 1) })
        .catch(() => undefined);
      return count;
    }));
});
