import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, col, fn } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string) => {
  const logged: string[] = [];
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: (sql) => logged.push(sql),
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Category = sequelize.define(
    'Category',
    { name: DataTypes.TEXT, parentId: DataTypes.INTEGER },
    { timestamps: false },
  );
  await sequelize.sync();
  await Category.bulkCreate([
    { name: 'root', parentId: null },
    { name: 'a', parentId: 1 },
    { name: 'b', parentId: 1 },
    { name: 'a1', parentId: 2 },
    { name: 'a1x', parentId: 4 },
    { name: 'other', parentId: null },
  ]);
  return { sequelize, Category, logged };
};

const text = async (chunks: AsyncIterable<Buffer>): Promise<string> => {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) {
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
};

describe('CTE', () => {
  it('walks a tree with WITH RECURSIVE and returns model instances', () =>
    withSchema(async ({ schema }) => {
      const { Category, logged } = await setup(schema);
      const subtree = await Category.findAll({
        with: {
          tree: {
            query: Category.subquery({ where: { name: 'a' } }),
            recursive: Category.subquery({
              where: { parentId: col('tree.id') },
              from: { tree: 'tree' },
            }),
          },
        },
        source: 'tree',
        order: [['id', 'ASC']],
      });
      expect(subtree.map((row) => row.get('name'))).toEqual(['a', 'a1', 'a1x']);
      expect(subtree[0]).toBeInstanceOf(Category);
      expect(logged.at(-1)).toContain('WITH RECURSIVE "tree" AS (SELECT');
      expect(logged.at(-1)).toContain('UNION ALL SELECT');
      expect(logged.at(-1)).toContain('FROM "tree" AS "Category"');
    }));

  it('uses materialized CTEs in count, filters and subqueries', () =>
    withSchema(async ({ schema }) => {
      const { Category } = await setup(schema);
      const roots = {
        roots: {
          query: Category.subquery({ attributes: ['id'], where: { parentId: null } }),
          materialized: true,
        },
      };
      expect(
        await Category.count({
          with: roots,
          where: {
            parentId: { [Op.in]: Category.subquery({ attributes: ['id'], source: 'roots' }) },
          },
        }),
      ).toBe(2);
      const children = await Category.findAll({
        attributes: ['name', [fn('count', col('child.id')), 'children']],
        from: { child: Category },
        where: { id: col('child.parentId') },
        group: ['Category.id', 'Category.name'],
        order: [['name', 'ASC']],
        raw: true,
      });
      expect(children).toEqual([
        { name: 'a', children: '1' },
        { name: 'a1', children: '1' },
        { name: 'root', children: '2' },
      ]);
    }));
});

describe('copyTo', () => {
  it('exports CSV with header, quoting and NULL handling', () =>
    withSchema(async ({ schema }) => {
      const { Category } = await setup(schema);
      await Category.create({ name: 'comma, "quoted"\nnew line', parentId: 1 });
      const csv = await text(
        Category.copyTo({
          attributes: ['id', 'name', 'parentId'],
          where: { id: { [Op.in]: [1, 2, 7] } },
          order: [['id', 'ASC']],
          format: 'csv',
          header: true,
        }),
      );
      expect(csv).toBe('id,name,parentId\n1,root,\n2,a,1\n7,"comma, ""quoted""\nnew line",1\n');
      const textFormat = await text(
        Category.copyTo({ attributes: ['name'], where: { name: "it's" }, nullString: 'NULL' }),
      );
      expect(textFormat).toBe('');
      expect(() => Category.copyTo({ delimiter: ';;' })).toThrow(/single character/);
      expect(() => Category.copyTo({ format: 'xml' as never })).toThrow(/unsupported format/);
    }));

  it('handles backpressure, early exit and errors without breaking the pool', () =>
    withSchema(async ({ schema }) => {
      const { Category, sequelize } = await setup(schema);
      await sequelize.query(
        `INSERT INTO "Categories" (name) SELECT 'bulk ' || g FROM generate_series(1, 5000) g`,
      );
      const parts: Buffer[] = [];
      for await (const chunk of Category.copyTo({ attributes: ['name'], order: [['id', 'ASC']] })) {
        parts.push(chunk);
        await new Promise((resolve) => setImmediate(resolve));
      }
      const exported = Buffer.concat(parts).toString('utf8').split('\n').slice(0, -1);
      expect(exported).toHaveLength(5006);
      expect(exported.slice(6)).toEqual(
        Array.from({ length: 5000 }, (_, index) => `bulk ${index + 1}`),
      );
      for await (const chunk of Category.copyTo({ attributes: ['name'] })) {
        expect(chunk.length).toBeGreaterThan(0);
        break;
      }
      await expect(
        text(Category.copyTo({ attributes: [[fn('nope_not_a_function'), 'x']] })),
      ).rejects.toThrow(/does not exist/);
      expect(await Promise.all(Array.from({ length: 6 }, () => Category.count()))).toEqual(
        Array.from({ length: 6 }, () => 5006),
      );
    }));
});
