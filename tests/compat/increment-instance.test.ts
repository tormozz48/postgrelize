import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: instance.increment / decrement', () => {
  it('refreshes the instance from the returned row and applies options.where', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Item = sequelize.define('Item', {
        a: { type: INTEGER, field: 'a_col', defaultValue: 0 },
        b: { type: INTEGER, defaultValue: 0 },
      });
      await sequelize.sync({ force: true });
      const item = await Item.create();
      const seen: unknown[] = [];
      const state = (): unknown => [item.get('a'), item.get('b'), item.changed()];
      await item.increment('a', { by: 2 });
      seen.push(state());
      await item.decrement('b', { by: 3 });
      seen.push(state());
      await item.increment('a', { where: { b: 1 } });
      seen.push(state());
      await item.increment({ b: 5 }, { returning: false });
      seen.push(state());
      await item.reload();
      seen.push(state());
      return seen;
    }));
});
