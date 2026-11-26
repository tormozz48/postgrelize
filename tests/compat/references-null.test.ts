import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: references: null', () => {
  it('creates no foreign key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Post = sequelize.define('post', {}, { timestamps: false });
      const Tag = sequelize.define('tag', {}, { timestamps: false });
      const ItemTag = sequelize.define(
        'itemTag',
        { taggableId: { type: INTEGER, references: null } as never },
        { timestamps: false },
      );
      Post.belongsToMany(Tag, { through: ItemTag, foreignKey: 'taggableId', constraints: false });
      await sequelize.sync();
      const [keys] = await sequelize.query(
        `SELECT conname FROM pg_constraint WHERE contype = 'f' AND connamespace = current_schema()::regnamespace ORDER BY conname`,
      );
      return keys;
    }));
});
