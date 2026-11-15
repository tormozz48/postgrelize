import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Items" (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(32) NOT NULL UNIQUE,
    qty INTEGER,
    kind VARCHAR(32) NOT NULL DEFAULT 'a',
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL
  );`;

const defineItem = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('Item', {
    sku: { type: lib.DataTypes.STRING, allowNull: false, unique: true },
    qty: lib.DataTypes.INTEGER,
    kind: { type: lib.DataTypes.STRING, defaultValue: 'a' },
  });

const seed = [
  { sku: 'a1', qty: 1, kind: 'a' },
  { sku: 'a2', qty: 5, kind: 'a' },
  { sku: 'b1', qty: 7, kind: 'b' },
];

const run = (scenario: (Item: ReturnType<typeof defineItem>, lib: Lib) => Promise<unknown>) =>
  expectSameResult(TABLES, async (lib, sequelize) => {
    const Item = defineItem(lib, sequelize);
    await Item.bulkCreate(seed);
    return scenario(Item, lib);
  });

describe('compat: aggregates', () => {
  it('count with group returns one row per group', () =>
    run(async (Item) =>
      ((await Item.count({ group: ['kind'] })) as unknown as { kind: string }[]).toSorted((a, b) =>
        a.kind.localeCompare(b.kind),
      ),
    ));

  it('max and sum of no rows are null', () =>
    run(async (Item) => {
      await Item.destroy({ where: {} });
      return [await Item.max('qty'), await Item.min('qty'), await Item.sum('qty')];
    }));
});

describe('compat: finders and writers', () => {
  it('findByPk with a missing key returns null', () =>
    run(async (Item) => [
      await Item.findByPk(null as never),
      await Item.findByPk(undefined as never),
    ]));

  it('create and update with fields write only the listed attributes', () =>
    run(async (Item) => {
      const created = await Item.create(
        { sku: 'f1', qty: 3, kind: 'zz' },
        { fields: ['sku', 'qty', 'createdAt', 'updatedAt'] },
      );
      const [updated] = await Item.update(
        { qty: 99, kind: 'yy' },
        { where: { sku: 'a1' }, fields: ['qty'] },
      );
      const rows = await Item.findAll({
        attributes: ['sku', 'qty', 'kind'],
        order: [['sku', 'ASC']],
      });
      return { created: created.get('kind'), updated, rows };
    }));

  it('bulkCreate of an empty list creates nothing', () =>
    run(async (Item) => [await Item.bulkCreate([]), await Item.count()]));

  it('saving an unchanged instance runs no update', () =>
    run(async (Item) => {
      const item = await Item.findOne({ where: { sku: 'a1' } });
      const before = item?.get('updatedAt');
      const saved = await item?.save();
      return { same: saved === item, untouched: saved?.get('updatedAt') === before };
    }));

  it('findOrCreate returns the row inserted by a concurrent writer', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Item = defineItem(lib, sequelize);
      Item.beforeCreate(async () => {
        await sequelize.query(
          `INSERT INTO "Items" (sku, qty, "createdAt", "updatedAt") VALUES ('race', 9, now(), now())`,
        );
      });
      const [item, created] = await Item.findOrCreate({
        where: { sku: 'race' },
        defaults: { qty: 1 },
      });
      return { sku: item.get('sku'), qty: item.get('qty'), created };
    }));

  it('findOrCreate rethrows when the failed create did not collide with a row', () =>
    expectSameError(TABLES, async (lib, sequelize) => {
      const Item = defineItem(lib, sequelize);
      return Item.findOrCreate({ where: { sku: 'x' }, defaults: { qty: 'many' as never } });
    }));
});

describe('compat: model definition', () => {
  it('an id attribute without primaryKey is rejected', () =>
    expectSameError(TABLES, async (lib, sequelize) => {
      sequelize.define('Broken', { id: lib.DataTypes.INTEGER });
    }));
});
