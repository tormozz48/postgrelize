import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const PRODUCTS = `
  CREATE TABLE "Products" (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255),
    qty INTEGER NOT NULL DEFAULT 0,
    deleted BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL
  );
  CREATE UNIQUE INDEX products_name_active ON "Products" (name) WHERE NOT deleted;`;

const defineProduct = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('Product', {
    sku: { type: lib.DataTypes.STRING(64), allowNull: false, unique: true },
    name: lib.DataTypes.STRING,
    qty: { type: lib.DataTypes.INTEGER, defaultValue: 0 },
    deleted: { type: lib.DataTypes.BOOLEAN, defaultValue: false },
  });

const withProducts = (
  run: (Product: ReturnType<typeof defineProduct>, lib: Lib) => Promise<unknown>,
) =>
  expectSameResult(PRODUCTS, async (lib, sequelize) => {
    const Product = defineProduct(lib, sequelize);
    await Product.bulkCreate([
      { sku: 'a', name: 'apple', qty: 1 },
      { sku: 'b', name: 'banana', qty: 2 },
    ]);
    return run(Product, lib);
  });

const all = (Product: { findAll: (options: object) => Promise<unknown> }) =>
  Product.findAll({ attributes: ['id', 'sku', 'name', 'qty', 'deleted'], order: [['id', 'ASC']] });

describe('compat: upsert', () => {
  it('inserts a new row and updates on unique key conflict', () =>
    withProducts(async (Product) => {
      const inserted = await Product.upsert({ sku: 'c', name: 'cherry', qty: 3 });
      const updated = await Product.upsert({ sku: 'a', qty: 10 });
      return [inserted, updated, await all(Product)];
    }));

  it('updates by primary key when it is provided', () =>
    withProducts(async (Product) => {
      const result = await Product.upsert({ id: 2, sku: 'b', name: 'blueberry' });
      return [result, await all(Product)];
    }));

  it('uses conflictFields', () =>
    withProducts(async (Product) => {
      const result = await Product.upsert(
        { sku: 'b', name: 'berry', qty: 7 },
        { conflictFields: ['sku'] },
      );
      return [result, await all(Product)];
    }));
});

describe('compat: bulkCreate conflict options', () => {
  it('ignoreDuplicates skips conflicting rows', () =>
    withProducts(async (Product) => {
      const created = await Product.bulkCreate(
        [
          { sku: 'a', name: 'dup' },
          { sku: 'z', name: 'zucchini' },
        ],
        {
          ignoreDuplicates: true,
        },
      );
      return [created.length, await all(Product)];
    }));

  it('updateOnDuplicate with default conflict target (unique key)', () =>
    withProducts(async (Product) => {
      const result = await Product.bulkCreate(
        [
          { sku: 'a', name: 'avocado', qty: 5 },
          { sku: 'd', name: 'date', qty: 4 },
        ],
        { updateOnDuplicate: ['name', 'qty'] },
      );
      return [result, await all(Product)];
    }));

  it('updateOnDuplicate with conflictAttributes', () =>
    withProducts(async (Product) => {
      await Product.bulkCreate([{ sku: 'a', name: 'apricot', qty: 9 }], {
        updateOnDuplicate: ['name', 'qty'],
        conflictAttributes: ['sku'],
      });
      return all(Product);
    }));

  it('updateOnDuplicate with conflictWhere for a partial unique index', () =>
    withProducts(async (Product) => {
      await Product.bulkCreate([{ sku: 'x', name: 'apple', qty: 42 }], {
        updateOnDuplicate: ['qty'],
        conflictAttributes: ['name'],
        conflictWhere: { deleted: false },
      });
      return all(Product);
    }));

  it('rejects empty updateOnDuplicate', () =>
    expectSameError(PRODUCTS, async (lib, sequelize) =>
      defineProduct(lib, sequelize).bulkCreate([{ sku: 'q' }], { updateOnDuplicate: [] }),
    ));
});
