import { parameterizedSql } from '../support/parameterized-log.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, literal, Op, QueryTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const withItems = <T>(
  run: (sequelize: Sequelize, Item: ReturnType<Sequelize['define']>) => Promise<T>,
  options: Readonly<{ logging?: (sql: string, options?: unknown) => void }> = {},
): Promise<T> =>
  withSchema(async ({ schema }) => {
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: options.logging ?? false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    const Item = sequelize.define(
      'Item',
      { name: DataTypes.TEXT, qty: DataTypes.INTEGER },
      { timestamps: false },
    );
    await Item.sync();
    await Item.bulkCreate([
      { name: 'a', qty: 1 },
      { name: 'b', qty: 5 },
      { name: 'c', qty: 7 },
    ]);
    return run(sequelize, Item);
  });

const names = (rows: readonly { get: (key: string) => unknown }[]): unknown[] =>
  rows.map((row) => row.get('name')).toSorted();

describe('replacements of the finders', () => {
  it('substitutes :name and ? placeholders of literals in where and attributes', () =>
    withItems(async (_sequelize, Item) => {
      expect(
        names(await Item.findAll({ where: literal('"qty" > :min'), replacements: { min: 1 } })),
      ).toEqual(['b', 'c']);
      expect(
        names(await Item.findAll({ where: literal('"qty" IN (?)'), replacements: [[1, 7]] })),
      ).toEqual(['a', 'c']);
      const row = await Item.findOne({
        where: { name: 'a' },
        attributes: ['name', [literal(':bonus::int + "qty"'), 'total']],
        replacements: { bonus: 10 },
      });
      expect(row?.get('total')).toBe(11);
    }));

  it('applies to count, findAndCountAll, findByPk and the count side of findAndCountAll', () =>
    withItems(async (_sequelize, Item) => {
      const where = literal('"qty" >= :qty');
      const replacements = { qty: 5 };
      expect(await Item.count({ where, replacements })).toBe(2);
      const { count, rows } = await Item.findAndCountAll({ where, replacements, limit: 1 });
      expect([count, rows.length]).toEqual([2, 1]);
      const byKey = await Item.findByPk(1, {
        attributes: [[literal(':label::text'), 'label']],
        replacements: { label: 'x' },
      });
      expect(byKey?.get('label')).toBe('x');
    }));

  it('combines with the values the finder binds itself', () =>
    withItems(async (_sequelize, Item) => {
      const rows = await Item.findAll({
        where: { [Op.and]: [{ name: { [Op.ne]: 'a' } }, literal('"qty" < :max')] },
        replacements: { max: 7 },
      });
      expect(names(rows)).toEqual(['b']);
    }));

  it('writes the replacement values as escaped literals and binds the finder values', () => {
    const statements: string[] = [];
    return withItems(
      async (_sequelize, Item) => {
        await Item.findAll({
          where: { [Op.and]: [{ qty: 1 }, literal('"name" = :name')] },
          replacements: { name: "x'; DROP TABLE y; --" },
        });
        const select = statements.findLast((sql) => sql.includes('FROM "Items"'));
        expect(select).toContain(`"name" = 'x''; DROP TABLE y; --'`);
        expect(select).toContain('"qty" = $1');
      },
      { logging: (_sql, options) => statements.push(parameterizedSql(options)) },
    );
  });

  it('leaves sequelize.query replacements alone', () =>
    withItems(async (sequelize) => {
      const rows = await sequelize.query('SELECT name FROM "Items" WHERE qty > :min', {
        type: QueryTypes.SELECT,
        replacements: { min: 5 },
      });
      expect(rows).toEqual([{ name: 'c' }]);
    }));

  it('findAndCountAll forwards distinct and col to the count', () =>
    withItems(async (_sequelize, Item) => {
      await Item.create({ name: 'd', qty: 7 });
      const plain = await Item.findAndCountAll();
      const distinct = await Item.findAndCountAll({ distinct: true, col: 'qty' });
      expect([plain.count, distinct.count]).toEqual([4, 3]);
    }));
});

describe('sequelize.query nest', () => {
  it('nests dotted column names and implies SELECT', () =>
    withItems(async (sequelize) => {
      const rows = await sequelize.query(
        `SELECT name AS "item.name", qty AS "item.stock.qty" FROM "Items" WHERE qty = 1`,
        { nest: true },
      );
      expect(rows).toEqual([{ item: { name: 'a', stock: { qty: 1 } } }]);
    }));
});
