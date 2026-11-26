import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const read = (value: unknown): unknown =>
  value instanceof Date ? ['date', value.getTime()] : [typeof value, value];

describe('compat: strings and numbers set on a DATE attribute', () => {
  it('become dates, also when saved', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', { at: lib.DataTypes.DATE });
      await sequelize.sync({ force: true });
      const built = Item.build({ at: null });
      built.set('at', '1970-01-01' as never);
      const seen: unknown[] = [read(built.get('at'))];
      const epoch = Date.UTC(2014, 1, 20);
      const created = await Item.create({ at: epoch });
      seen.push(read(created.get('at')));
      await created.update({ at: '2015-03-04T05:06:07Z' });
      await created.reload();
      seen.push(read(created.get('at')));
      created.set('at', new Date('2015-03-04T05:06:07Z').getTime() as never);
      seen.push(created.changed());
      built.set('at', 'infinity' as never);
      seen.push(read(built.get('at')));
      built.set('at', '' as never);
      seen.push(read(built.get('at')));
      return seen;
    }));
});
