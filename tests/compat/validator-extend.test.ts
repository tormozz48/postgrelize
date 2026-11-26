import { describe, expect, it } from 'vitest';
import { libraries } from '../support/compat.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

type Extensible = { extend: (name: string, validate: (value: string) => boolean) => void };

describe('compat: Validator.extend', () => {
  it('registers attribute validators', async () => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const run = async (name: 'sequelize' | 'postgrelize'): Promise<unknown> => {
      const lib = libraries[name];
      const sequelize = new lib.Sequelize(testDatabaseUrl(), { logging: false });
      (sequelize as unknown as { Validator: Extensible }).Validator.extend(
        'isExactly7Characters',
        (value) => value.length === 7,
      );
      const User = sequelize.define('User', {
        name: { type: lib.DataTypes.STRING, validate: { isExactly7Characters: true } as never },
      });
      const check = async (value: string): Promise<unknown> =>
        User.build({ name: value })
          .validate()
          .then(
            () => 'ok',
            (error: Error) => error.message,
          );
      const results = [
        await check('abcdefg'),
        await check('a'),
        typeof (lib.Sequelize as unknown as { Validator: Extensible }).Validator.extend,
      ];
      await sequelize.close();
      return results;
    };
    expect(await run('postgrelize')).toEqual(await run('sequelize'));
  });
});
