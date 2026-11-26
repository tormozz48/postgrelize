import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

describe('compat: instance.update saves only what it was given', () => {
  it('leaves other unsaved changes unsaved, and keeps setter side effects', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER } = lib.DataTypes;
      const Item = sequelize.define('Item', {
        x: INTEGER,
        y: STRING,
        slug: STRING,
        title: {
          type: STRING,
          set(this: Model, value: string) {
            this.setDataValue('title', value);
            this.setDataValue('slug', value.toLowerCase());
          },
        },
      });
      Item.beforeUpdate((instance: Model) => {
        if (instance.get('y') === 'hook') {
          instance.set('x', 99);
        }
      });
      await sequelize.sync({ force: true });
      const item = await Item.create({ y: 'a' });
      const state = async (): Promise<unknown> => {
        const stored = await Item.findByPk(item.get('id') as number);
        return [
          stored?.get('x'),
          stored?.get('y'),
          stored?.get('title'),
          stored?.get('slug'),
          item.changed(),
        ];
      };
      const seen: unknown[] = [];
      item.set('x', 5);
      await item.update({ y: '1' });
      seen.push(await state());
      await item.update({ y: '1' });
      seen.push(await state());
      await item.update({ title: 'ABC' });
      seen.push(await state());
      await item.update({ y: 'hook' });
      seen.push(await state());
      await item.save();
      seen.push(await state());
      return seen;
    }));
});
