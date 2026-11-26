import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

describe('compat: validation of attributes changed by beforeUpdate', () => {
  it('validates a new value of an attribute that was already changed', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', {
        name: lib.DataTypes.STRING,
        email: { type: lib.DataTypes.STRING, validate: { isEmail: true } },
      });
      let next = 'B';
      User.beforeUpdate((instance: Model) => {
        instance.set('email', next);
      });
      await sequelize.sync({ force: true });
      const user = await User.create({ name: 'a', email: 'a@example.com' });
      const save = async (values: object): Promise<unknown> =>
        user
          .set(values as never)
          .save()
          .then(
            () => 'saved',
            (error: Error) => error.name,
          );
      const seen: unknown[] = [await save({ name: 'b', email: 'still@example.com' })];
      seen.push(await save({ name: 'c' }));
      next = 'hook@example.com';
      seen.push(await save({ name: 'd', email: 'x@example.com' }));
      await user.reload();
      seen.push(user.get('name'), user.get('email'));
      return seen;
    }));
});
