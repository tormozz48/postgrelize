import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const ITEMS = `
  CREATE TABLE "Items" (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    s VARCHAR(64) NOT NULL DEFAULT 'x',
    n INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL
  );`;

const defineItem = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('Item', {
    sku: { type: lib.DataTypes.STRING(64), allowNull: false, unique: true },
    s: { type: lib.DataTypes.STRING(64), allowNull: false, defaultValue: 'x' },
    n: lib.DataTypes.INTEGER,
  });

const rows = (Item: ReturnType<typeof defineItem>) =>
  Item.findAll({ raw: true, attributes: ['sku', 's'], order: [['id', 'ASC']] });

describe('compat: explicit undefined uses the attribute default', () => {
  it('build', () =>
    expectSameResult(ITEMS, async (lib, sequelize) => {
      const item = defineItem(lib, sequelize).build({ sku: 'a', s: undefined, n: undefined });
      return [item.get('s'), item.get('n'), item.changed()];
    }));

  it('create', () =>
    expectSameResult(ITEMS, async (lib, sequelize) => {
      const Item = defineItem(lib, sequelize);
      const item = await Item.create({ sku: 'a', s: undefined });
      return [item.get('s'), await rows(Item)];
    }));

  it('bulkCreate', () =>
    expectSameResult(ITEMS, async (lib, sequelize) => {
      const Item = defineItem(lib, sequelize);
      await Item.bulkCreate([
        { sku: 'a', s: undefined },
        { sku: 'b', s: 'y' },
      ]);
      return rows(Item);
    }));

  it('upsert', () =>
    expectSameResult(ITEMS, async (lib, sequelize) => {
      const Item = defineItem(lib, sequelize);
      await Item.upsert({ sku: 'a', s: undefined });
      return rows(Item);
    }));
});
