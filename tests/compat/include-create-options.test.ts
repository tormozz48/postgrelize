import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const SCHEMA = `
  CREATE TABLE "Products" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Tags" (id SERIAL PRIMARY KEY, "ProductId" INTEGER, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Labels" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "ProductLabels" ("ProductId" INTEGER, "LabelId" INTEGER, note TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());`;

type Seen = { myOption?: unknown; parentRecord?: unknown };

describe('compat: options of nested creation', () => {
  it('hands include entry options and the parent record to the nested hooks', () =>
    expectSameResult(SCHEMA, async (lib, sequelize) => {
      const { DataTypes } = lib;
      const User = sequelize.define('User', { name: DataTypes.TEXT });
      const Tag = sequelize.define('Tag', { name: DataTypes.TEXT });
      const Product = sequelize.define('Product', { title: DataTypes.TEXT });
      Product.belongsTo(User);
      Product.hasMany(Tag);
      const seen: Record<string, Seen> = {};
      const record = (kind: string) => (_row: unknown, options: Seen) => {
        seen[kind] = options;
      };
      User.beforeCreate(record('user'));
      Tag.beforeCreate(record('tag'));
      const product = await Product.create(
        { title: 'Chair', User: { name: 'Mick' }, Tags: [{ name: 'a' }] } as never,
        {
          include: [
            { model: User, myOption: 'u' },
            { model: Tag, myOption: 't' },
          ],
        } as never,
      );
      return {
        user: [seen['user']?.myOption, seen['user']?.parentRecord === product],
        tag: [seen['tag']?.myOption, seen['tag']?.parentRecord === product],
      };
    }));
});

describe('compat: nested bulkCreate', () => {
  it('creates nested records with bulk hooks that see the include entry options', () =>
    expectSameResult(SCHEMA, async (lib, sequelize) => {
      const { DataTypes } = lib;
      const User = sequelize.define('User', { name: DataTypes.TEXT });
      const Tag = sequelize.define('Tag', { name: DataTypes.TEXT });
      const Label = sequelize.define('Label', { name: DataTypes.TEXT });
      const ProductLabel = sequelize.define('ProductLabel', { note: DataTypes.TEXT });
      const Product = sequelize.define('Product', { title: DataTypes.TEXT });
      Product.belongsTo(User);
      Product.hasMany(Tag);
      Product.belongsToMany(Label, { through: ProductLabel });
      const seen: Record<string, unknown[]> = {};
      const record = (kind: string) => (rows: unknown[], options: { myOption?: unknown }) => {
        (seen[kind] ??= []).push([rows.length, options.myOption]);
      };
      User.beforeBulkCreate(record('user'));
      Tag.afterBulkCreate(record('tag'));
      Label.beforeBulkCreate(record('label'));
      const products = await Product.bulkCreate(
        [
          { title: 'a', User: { name: 'u1' }, Tags: [{ name: 't1' }, { name: 't2' }] },
          { title: 'b', User: { name: 'u2' }, Tags: [{ name: 't3' }] },
        ] as never,
        {
          include: [
            { model: User, myOption: 'u' },
            { model: Tag, myOption: 't' },
          ],
        } as never,
      );
      const labelled = await Product.bulkCreate(
        [
          { title: 'c', Labels: [{ name: 'l1', ProductLabel: { note: 'n' } }, { name: 'l2' }] },
        ] as never,
        { include: [{ model: Label, myOption: 'l' }] } as never,
      );
      return {
        seen,
        products: products.map((product) => product.toJSON()),
        labelled: labelled.map((product) => product.toJSON()),
        tags: (await Tag.findAll({ order: [['id', 'ASC']], raw: true })).map(
          (tag) => (tag as unknown as { ProductId: number }).ProductId,
        ),
        links: await sequelize.query(
          'SELECT "ProductId", "LabelId", note FROM "ProductLabels" ORDER BY "LabelId"',
          { type: 'SELECT' },
        ),
      };
    }));
});
