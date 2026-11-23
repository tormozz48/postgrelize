import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: VIRTUAL attributes in update and find', () => {
  it('update ignores virtual attributes and applies the attributes their setters change', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('UserWithVirtualSetters', {
        username: lib.DataTypes.STRING,
        illness_name: lib.DataTypes.STRING,
        illness_pain: lib.DataTypes.INTEGER,
        illness: {
          type: lib.DataTypes.VIRTUAL,
          set(
            this: { set(key: string, value: unknown): void },
            value: { name: string; pain: number },
          ) {
            this.set('illness_name', value.name);
            this.set('illness_pain', value.pain);
          },
        },
      });
      await User.sync({ force: true });
      await User.create({ username: 'Jan', illness_name: 'Headache', illness_pain: 5 });
      await User.update({ illness: { pain: 10, name: 'Backache' } } as never, {
        where: { username: 'Jan' },
      });
      const withSideEffects = (await User.findOne({ where: { username: 'Jan' } }))?.get();
      await User.update(
        { illness: { pain: 1, name: 'Other' } } as never,
        { where: { username: 'Jan' }, sideEffects: false } as never,
      );
      const withoutSideEffects = (await User.findOne({ where: { username: 'Jan' } }))?.get();
      return { withSideEffects, withoutSideEffects };
    }));

  it('selecting a virtual attribute selects the attributes it depends on', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'User',
        {
          name: lib.DataTypes.STRING,
          active: {
            type: lib.DataTypes.VIRTUAL(lib.DataTypes.BOOLEAN, ['createdAt']),
            get(this: { get(key: string): Date }) {
              return this.get('createdAt') instanceof Date;
            },
          },
        },
        { timestamps: true },
      );
      await User.sync({ force: true });
      await User.create({ name: 'a' });
      const users = await User.findAll({ attributes: ['active'] });
      return users.map((user) => ({
        active: user.get('active'),
        hasCreatedAt: user.get('createdAt') instanceof Date,
        name: user.get('name'),
      }));
    }));
});
