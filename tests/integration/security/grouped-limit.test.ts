import { describe, expect, it } from 'vitest';
import { DataTypes } from '../../../src/index.ts';
import { PAYLOADS, withCanary } from '../../support/injection.ts';

describe('groupedLimit inputs do not reach the SQL text', () => {
  it('binds values and through.where, and rejects an unknown `on` attribute', () =>
    withCanary(async ({ sequelize }) => {
      const User = sequelize.define('User', {});
      const Tag = sequelize.define('Tag', { code: DataTypes.TEXT });
      const Item = sequelize.define('Item', { code: DataTypes.TEXT });
      const Link = sequelize.define('Link', { code: DataTypes.TEXT });
      const tags = User.belongsToMany(Tag, { through: Link });
      await sequelize.sync();
      const user = await User.create();
      const tag = await Tag.create();
      for (const payload of PAYLOADS) {
        await Item.destroy({ where: {} });
        await Item.create({ code: payload });
        await Link.destroy({ where: {} });
        await Link.create({
          UserId: user.get('id'),
          TagId: tag.get('id'),
          code: payload,
        } as never);
        const grouped = { limit: 1, on: 'code', values: [payload] };
        expect(await Item.findAll({ groupedLimit: grouped })).toHaveLength(1);
        const linked = {
          limit: 1,
          on: tags,
          values: [tag.get('id')],
          through: { where: { code: payload } },
        };
        expect(await User.findAll({ groupedLimit: linked })).toHaveLength(1);
        await expect(
          Item.findAll({ groupedLimit: { limit: 1, on: payload, values: [1] } }),
        ).rejects.toThrow('Unknown attribute');
      }
    }));
});
