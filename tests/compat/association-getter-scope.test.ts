import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Accessors = Record<string, ((arg?: unknown) => Promise<unknown>) | undefined>;
type Row = { get: (key: string) => unknown } | null;

const name = (row: unknown): unknown => (row as Row)?.get('name') ?? null;
const names = (rows: unknown): unknown[] => (rows as unknown[]).map(name).toSorted();

describe('compat: scope option of association getters', () => {
  it('false removes the default scope and a name replaces it, for every association type', () =>
    expectSameResult('', async (lib, sequelize) => {
      const attributes = { name: lib.DataTypes.STRING, active: lib.DataTypes.BOOLEAN };
      const options = {
        defaultScope: { where: { active: true } },
        scopes: { off: { where: { active: false } } },
      };
      const Owner = sequelize.define('Owner', { name: lib.DataTypes.STRING });
      const Boss = sequelize.define('Boss', attributes, options);
      const Profile = sequelize.define('Profile', attributes, options);
      const Item = sequelize.define('Item', attributes, options);
      const Tag = sequelize.define('Tag', attributes, options);
      Owner.belongsTo(Boss);
      Owner.hasOne(Profile);
      Owner.hasMany(Item);
      Owner.belongsToMany(Tag, { through: 'OwnerTag' });
      await sequelize.sync({ force: true });
      const boss = await Boss.create({ name: 'boss', active: false });
      const owner = await Owner.create({ name: 'o', BossId: boss.get('id') });
      await Profile.create({ name: 'p', active: false, OwnerId: owner.get('id') });
      await Item.bulkCreate([
        { name: 'i1', active: true, OwnerId: owner.get('id') },
        { name: 'i2', active: false, OwnerId: owner.get('id') },
      ]);
      const tags = await Tag.bulkCreate([
        { name: 't1', active: true },
        { name: 't2', active: false },
      ]);
      await (owner as unknown as Accessors).addTags!(tags);
      const o = owner as unknown as Accessors;
      const result: unknown[] = [];
      for (const scope of [undefined, false, 'off']) {
        const query = scope === undefined ? {} : { scope };
        result.push({
          boss: name(await o.getBoss!(query)),
          profile: name(await o.getProfile!(query)),
          items: names(await o.getItems!(query)),
          tags: names(await o.getTags!(query)),
          itemCount: await o.countItems!(query),
          tagCount: await o.countTags!(query),
        });
      }
      return result;
    }));
});
