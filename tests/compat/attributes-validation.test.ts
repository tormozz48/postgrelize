import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: invalid attributes option', () => {
  it('rejects an empty and a malformed attribute list with the v6 messages', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', { username: lib.DataTypes.STRING });
      await sequelize.sync();
      const failure = async (attributes: unknown) => {
        const error = (await User.findAll({ attributes: attributes as never }).catch(
          (caught: unknown) => caught,
        )) as Error;
        return [error.name, error.message];
      };
      return [await failure([]), await failure(['id', ['username']])];
    }));
});
