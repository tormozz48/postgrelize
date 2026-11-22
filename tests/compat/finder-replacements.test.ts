import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Items" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL
  );`;

const defineItem = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('Item', {
    name: { type: lib.DataTypes.STRING, allowNull: false },
    qty: { type: lib.DataTypes.INTEGER, allowNull: false },
  });

const run = (scenario: (Item: ReturnType<typeof defineItem>, lib: Lib) => Promise<unknown>) =>
  expectSameResult(TABLES, async (lib, sequelize) => {
    const Item = defineItem(lib, sequelize);
    await Item.bulkCreate([
      { name: 'a', qty: 1 },
      { name: 'b', qty: 5 },
      { name: "it's :qty? $1", qty: 7 },
    ]);
    return scenario(Item, lib);
  });

const names = (rows: readonly { get: (key: string) => unknown }[]): unknown[] =>
  rows.map((row) => row.get('name')).toSorted();

describe('compat: replacements of the finders', () => {
  it('findAll substitutes named placeholders of a literal where', () =>
    run(async (Item, { literal }) =>
      names(await Item.findAll({ where: literal('"qty" > :min'), replacements: { min: 1 } })),
    ));

  it('findAll substitutes positional placeholders', () =>
    run(async (Item, { literal }) =>
      names(
        await Item.findAll({ where: literal('"qty" > ? AND "name" <> ?'), replacements: [1, 'b'] }),
      ),
    ));

  it('expands an array into a list for IN (:ids)', () =>
    run(async (Item, { literal }) =>
      names(
        await Item.findAll({ where: literal('"qty" IN (:qtys)'), replacements: { qtys: [1, 7] } }),
      ),
    ));

  it('keeps a placeholder lookalike inside a value as a plain value', () =>
    run(async (Item, { literal }) =>
      names(
        await Item.findAll({
          where: literal('"name" = :name'),
          replacements: { name: "it's :qty? $1" },
        }),
      ),
    ));

  it('does not touch values bound by the finder itself', () =>
    run(async (Item, { literal }) =>
      names(
        await Item.findAll({
          where: { name: "it's :qty? $1" },
          attributes: ['name', [literal(':bonus::int'), 'bonus']],
          replacements: { bonus: 3 },
        }),
      ),
    ));

  it('findOne, findByPk and count substitute replacements', () =>
    run(async (Item, { literal }) => [
      (await Item.findOne({ where: literal('"qty" = :qty'), replacements: { qty: 5 } }))?.get(
        'name',
      ),
      (
        await Item.findByPk(1, {
          attributes: ['name', [literal(':n::text'), 'n']],
          replacements: { n: 'x' },
        })
      )?.get('n'),
      await Item.count({ where: literal('"qty" >= :qty'), replacements: { qty: 5 } } as never),
    ]));

  it('findAndCountAll substitutes replacements in the rows and the count', () =>
    run(async (Item, { literal }) => {
      const { count, rows } = await Item.findAndCountAll({
        where: literal('"qty" >= :qty'),
        replacements: { qty: 5 },
        limit: 1,
        order: [['id', 'ASC']],
      });
      return [count, names(rows)];
    }));

  it('findAndCountAll forwards distinct and col to the count', () =>
    run(async (Item) => {
      const { count } = await Item.findAndCountAll({ distinct: true, col: 'qty' });
      return count;
    }));

  it('destroy substitutes replacements', () =>
    run(async (Item, { literal }) => {
      const destroyed = await Item.destroy({
        where: literal('"qty" = ?'),
        replacements: [5],
      } as never);
      return [destroyed, names(await Item.findAll())];
    }));

  it('rejects a placeholder without a replacement value', async () => {
    await run(async (Item, { literal }) => {
      try {
        await Item.findAll({ where: literal('"qty" > :missing'), replacements: { other: 1 } });
        return 'resolved';
      } catch {
        return 'rejected';
      }
    });
  });
});
