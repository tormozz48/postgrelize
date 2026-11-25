import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const SCHEMA = `
  CREATE TABLE "Products" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE "Tags" (id SERIAL PRIMARY KEY, "ProductId" INTEGER, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());`;

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
