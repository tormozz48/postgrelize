import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: set of nested keys of a JSON attribute', () => {
  it('writes into the object, marks the attribute changed and saves it', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        meta: lib.DataTypes.JSONB,
        name: lib.DataTypes.STRING,
      });
      await sequelize.sync({ force: true });
      const item = await Item.create({ meta: { city: 'a', address: { n: 1 } } });
      const seen: unknown[] = [];
      item.set('meta.city' as never, 'a' as never);
      item.set('meta.address' as never, { n: 1 } as never);
      seen.push(item.changed());
      item.set('meta.city' as never, 'b' as never);
      item.set('meta.deep.er' as never, 1 as never);
      item.set('name.x' as never, 1 as never);
      item.set('meta.__proto__.polluted' as never, 1 as never);
      seen.push(item.changed(), ({} as { polluted?: unknown }).polluted);
      await item.save();
      await item.reload();
      seen.push(item.get('meta'), item.get('name'));
      return seen;
    }));
});
