import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

describe('compat: set of included data on a built instance', () => {
  it('builds the nested instances, with and without raw', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const Product = sequelize.define('product', { title: STRING });
      const Tag = sequelize.define('tag', { name: STRING });
      const User = sequelize.define('user', { name: STRING });
      Product.hasMany(Tag);
      Product.belongsTo(User);
      await sequelize.sync({ force: true });
      const data = {
        title: 'chair',
        tags: [{ name: 'a' }, { name: 'b' }],
        user: { name: 'mick' },
      };
      const results: unknown[] = [];
      for (const options of [{}, { raw: true }]) {
        const product = Product.build({}, { include: [User, Tag] });
        product.set(data as never, options);
        const nested = product as unknown as { tags: Model[]; user: Model };
        results.push(
          nested.tags.map((tag) => [tag instanceof Tag, tag.get('name')]),
          [nested.user instanceof User, nested.user.get('name')],
          product.get('title'),
        );
      }
      const empty = Product.build({}, { include: [User, Tag] });
      empty.set({ user: null, tags: [] } as never);
      results.push(empty.get('user'), empty.get('tags'));
      return results;
    }));
});
