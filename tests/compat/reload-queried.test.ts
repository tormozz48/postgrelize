import { describe, expect, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult, type Scenario } from '../support/compat.ts';

const reloadedAndFound = async (...[lib, sequelize]: Parameters<Scenario>) => {
  const Item = sequelize.define(
    'Item',
    { name: lib.DataTypes.STRING },
    {
      getterMethods: {
        upperName(this: Model) {
          return String(this.getDataValue('name')).toUpperCase();
        },
      },
    },
  );
  await sequelize.sync({ force: true });
  const created = await Item.create({ name: 'a' } as never);
  await created.reload();
  const found = (await Item.findByPk(created.get('id') as number)) as Model;
  return { created, found };
};

const keys = (values: object): string[] => Object.keys(values).toSorted();

describe('compat: reload marks the instance as loaded by a query', () => {
  it('get() and toJSON() keys after a reload equal those of findByPk()', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { created, found } = await reloadedAndFound(lib, sequelize);
      return {
        get: [keys(created.get()), keys(found.get())],
        json: [keys(created.toJSON()), keys(found.toJSON())],
      };
    }));

  it('a reloaded instance deep-equals the same row from findByPk()', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { created, found } = await reloadedAndFound(lib, sequelize);
      expect(created).toEqual(found);
      return true;
    }));
});
