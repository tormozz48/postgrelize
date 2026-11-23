import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const message = (run: () => Promise<unknown>): Promise<string> =>
  run().then(
    () => 'ok',
    (error: Error) => `${error.name}: ${error.message}`,
  );

describe('compat: timestamp attributes declared with allowNull: false', () => {
  it('create, save and bulkCreate fill createdAt and updatedAt before validation', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Comment = sequelize.define(
        'comment',
        {
          text: { type: lib.DataTypes.STRING, field: 'comment_text' },
          createdAt: { type: lib.DataTypes.DATE, field: 'created_at', allowNull: false },
          updatedAt: { type: lib.DataTypes.DATE, field: 'updated_at', allowNull: false },
        },
        { tableName: 'comments', timestamps: true },
      );
      await sequelize.sync({ force: true });
      const created = await Comment.create({ text: 'a' });
      const built = Comment.build({ text: 'b' });
      const results = {
        create: await message(() => Comment.create({ text: 'c' })),
        save: await message(() => built.save()),
        bulk: await message(() => Comment.bulkCreate([{ text: 'd' }, { text: 'e' }])),
      };
      return {
        results,
        createdHasDates:
          created.get('createdAt') instanceof Date && created.get('updatedAt') instanceof Date,
        count: await Comment.count(),
      };
    }));
});
