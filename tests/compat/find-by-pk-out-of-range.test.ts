import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const huge = 4.732322332323333e30;

describe('compat: findByPk with a number no integer key can hold', () => {
  it.each(['SMALLINT', 'INTEGER', 'BIGINT'] as const)(
    'finds nothing for a %s key',
    async (type) => {
      await expectSameResult('', async (lib, sequelize) => {
        const Item = sequelize.define('Item', {
          id: { type: lib.DataTypes[type], primaryKey: true },
        });
        await sequelize.sync();
        await Item.create({ id: 1 });
        const rejected = await Item.findByPk(huge, {
          rejectOnEmpty: true,
        }).catch((error: Error) => error.name);
        return [
          await Item.findByPk(huge),
          await Item.findByPk(1.5),
          rejected,
          (await Item.findByPk(1))?.get('id') !== undefined,
        ];
      });
    },
  );
});
