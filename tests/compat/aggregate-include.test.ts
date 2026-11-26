import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: aggregate with include', () => {
  it('joins the includes of the options and of the scope', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER, STRING } = lib.DataTypes;
      const Owner = sequelize.define(
        'Owner',
        { name: STRING, score: INTEGER },
        { scopes: { high: () => ({ include: [{ model: Pet, where: { priority: 1 } }] }) } },
      );
      const Pet = sequelize.define('Pet', { priority: INTEGER });
      Owner.hasMany(Pet);
      await sequelize.sync({ force: true });
      const owners = await Owner.bulkCreate([
        { name: 'a', score: 10 },
        { name: 'b', score: 20 },
      ]);
      await Pet.bulkCreate([
        { priority: 1, OwnerId: owners[0]!.get('id') },
        { priority: 2, OwnerId: owners[1]!.get('id') },
      ] as never);
      const options = { includeIgnoreAttributes: false, plain: true, attributes: [] };
      return [
        await Owner.aggregate('Owner.id' as never, 'count', {
          ...options,
          include: [{ model: Pet, where: { priority: 2 } }],
          dataType: lib.DataTypes.INTEGER,
        } as never),
        await Owner.scope({ method: ['high'] }).aggregate('score', 'sum', options as never),
      ];
    }));
});
