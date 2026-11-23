import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const message = (run: () => unknown): Promise<string> =>
  Promise.resolve()
    .then(run)
    .then(
      () => 'ok',
      (error: Error) => `${error.name}: ${error.message}`,
    );

type Many = {
  get(
    instances: unknown[],
  ): Promise<
    Record<string, { get(key: string): unknown }[] | { get(key: string): unknown } | null>
  >;
};

describe('compat: association definition checks and get with several sources', () => {
  it('an alias that is the name of an attribute is a naming collision', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('user', {
        user: lib.DataTypes.INTEGER,
        attribute: lib.DataTypes.STRING,
      });
      const Attribute = sequelize.define('attribute', {});
      return {
        hasMany: await message(() => User.hasMany(User, { as: 'user' })),
        hasOne: await message(() => User.hasOne(Attribute)),
        belongsTo: await message(() => User.belongsTo(Attribute, { as: 'owner' })),
        duplicateAlias: await message(() => {
          const Task = sequelize.define('task', {});
          User.hasMany(Task, { as: 'jobs' });
          User.hasMany(Task, { as: 'jobs' });
        }),
      };
    }));

  it('HasMany#get and HasOne#get load several sources at once, keyed by the source key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', { name: lib.DataTypes.STRING });
      const Task = sequelize.define('Task', { title: lib.DataTypes.STRING });
      const Profile = sequelize.define('Profile', { bio: lib.DataTypes.STRING });
      const tasks = User.hasMany(Task) as unknown as Many;
      const profile = User.hasOne(Profile) as unknown as Many;
      await sequelize.sync({ force: true });
      const a = await User.create({ name: 'a' });
      const b = await User.create({ name: 'b' });
      const c = await User.create({ name: 'c' });
      await Task.bulkCreate([
        { title: 't1', UserId: a.get('id') },
        { title: 't2', UserId: a.get('id') },
        { title: 't3', UserId: b.get('id') },
      ] as never);
      await Profile.create({ bio: 'pa', UserId: a.get('id') } as never);
      const many = await tasks.get([a, b, c]);
      const one = await profile.get([a, b]);
      return {
        many: Object.fromEntries(
          Object.entries(many).map(([key, rows]) => [
            key,
            (rows as { get(k: string): unknown }[]).map((row) => row.get('title')).toSorted(),
          ]),
        ),
        one: Object.fromEntries(
          Object.entries(one).map(([key, row]) => [
            key,
            (row as { get(k: string): unknown } | null)?.get('bio') ?? null,
          ]),
        ),
      };
    }));
});
