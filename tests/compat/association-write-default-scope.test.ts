import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Accessors = Record<string, (arg?: unknown) => Promise<unknown>>;

describe('compat: association writes ignore the default scope of the target', () => {
  it('set, add, has and remove reach rows outside the default scope', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Company = sequelize.define('Company', {});
      const User = sequelize.define(
        'User',
        { level: INTEGER },
        { defaultScope: { where: { level: { [lib.Op.gte]: 5 } } } },
      );
      const Badge = sequelize.define(
        'Badge',
        { level: INTEGER },
        { defaultScope: { where: { level: 5 } } },
      );
      Company.hasMany(User);
      Company.hasOne(Badge);
      await sequelize.sync({ force: true });
      const company = (await Company.create()) as unknown as Accessors;
      const users = await User.bulkCreate([{ level: 5 }, { level: 3 }, { level: 1 }]);
      const badges = await Badge.bulkCreate([{ level: 1 }, { level: 2 }]);
      const linked = async (model: typeof User): Promise<unknown> =>
        (await model.unscoped().findAll({ order: [['id', 'ASC']] })).map((row) =>
          row.get('CompanyId'),
        );
      const seen: unknown[] = [];
      await company['setUsers']!(users);
      seen.push(await linked(User), await company['hasUser']!(users[2]));
      await company['removeUser']!(users[1]);
      seen.push(await linked(User));
      await company['setUsers']!([users[1]]);
      seen.push(await linked(User));
      await company['addUser']!(users[2]);
      seen.push(await linked(User));
      await company['setBadge']!(badges[0]);
      await company['setBadge']!(badges[1]);
      seen.push(await linked(Badge));
      return seen;
    }));
});
