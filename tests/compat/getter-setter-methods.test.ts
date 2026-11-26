import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

type Item = Model & Record<string, unknown>;

const cents = (item: Model): number => item.getDataValue('cents') as number;

const getterMethods = {
  price(this: Model) {
    return cents(this) / 100;
  },
  stored() {
    return 'attribute getter wins';
  },
  version(...args: unknown[]) {
    const [key, options] = args as [string, { api?: number } | undefined];
    return [key, options?.api ?? 0];
  },
};

const setterMethods = {
  price(this: Model, value: number) {
    this.setDataValue('cents', value * 100);
  },
  secret(this: Model, value: string) {
    this.set('hidden', value);
  },
};

describe('compat: getterMethods / setterMethods', () => {
  it('virtual getters and setters run on build, get, set and toJSON', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Product = sequelize.define(
        'Product',
        {
          cents: lib.DataTypes.INTEGER,
          hidden: lib.DataTypes.STRING,
          stored: {
            type: lib.DataTypes.INTEGER,
            get(this: Model) {
              return (this.getDataValue('stored') as number) * 10;
            },
          },
        },
        { getterMethods, setterMethods },
      );
      await sequelize.sync({ force: true });
      const built = Product.build({ price: 20, stored: 2 }) as Item;
      built['secret'] = 's';
      built.set('unknown' as never, 'x' as never);
      await built.save();
      const found = (await Product.findByPk(built.get('id') as number)) as Item;
      return {
        accessor: [built['price'], built['hidden'], built['cents']],
        get: [built.get('price'), built.get('version', { api: 2 } as never), built.get('unknown')],
        json: { ...found.toJSON(), createdAt: null, updatedAt: null },
      };
    }));
});
