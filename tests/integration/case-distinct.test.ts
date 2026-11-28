import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  caseWhen,
  col,
  exists,
  fn,
  tuple,
  where,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Node = sequelize.define(
    'Node',
    {
      name: DataTypes.TEXT,
      kids: DataTypes.ARRAY(DataTypes.INTEGER),
      a: DataTypes.INTEGER,
      b: DataTypes.INTEGER,
    },
    { timestamps: false },
  );
  const Tag = sequelize.define('Tag', { label: DataTypes.TEXT }, { timestamps: false });
  Node.hasMany(Tag);
  Tag.belongsTo(Node);
  await sequelize.sync();
  await Node.bulkCreate([
    { name: 'root', kids: [2], a: 1, b: null },
    { name: 'child', kids: [3], a: 1, b: 2 },
    { name: 'leaf', kids: [], a: null, b: null },
    { name: 'other', kids: [], a: 5, b: 5 },
  ]);
  await Tag.bulkCreate([
    { label: 'x', NodeId: 1 },
    { label: 'x', NodeId: 1 },
    { label: 'y', NodeId: 2 },
  ]);
  return { sequelize, Node, Tag };
};

const names = (rows: readonly unknown[]): unknown[] =>
  rows.map((row) => (row as { name: unknown }).name);

describe('WITH over an array column', () => {
  it.each([false, true])('walks the tree with materialized: %s', (materialized) =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      const rows = await Node.findAll({
        with: {
          tree: {
            query: Node.subquery({ where: { name: 'root' } }),
            recursive: Node.subquery({
              from: { tree: 'tree' },
              where: { id: { [Op.any]: col('tree.kids') } },
            }),
            materialized,
          },
        },
        source: 'tree',
        attributes: ['name'],
        order: [['id', 'ASC']],
        raw: true,
      });
      expect(names(rows)).toEqual(['root', 'child', 'leaf']);
    }),
  );

  it('joins a CTE built from a caller-supplied subquery and uses it in exists()', () =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      const hit = Node.subquery({ attributes: ['id'], where: { name: 'child' } });
      const joined = await Node.findAll({
        with: { hit },
        from: { hit: 'hit' },
        where: { id: col('hit.id') },
        raw: true,
      });
      const existing = await Node.findAll({
        with: { hit },
        where: exists(
          Node.subquery({
            as: 'h',
            source: 'hit',
            attributes: ['id'],
            where: { id: col('Node.id') },
          }),
        ),
        raw: true,
      });
      expect(names(joined)).toEqual(['child']);
      expect(names(existing)).toEqual(['child']);
    }));
});

describe('selectDistinct', () => {
  it('drops duplicates of a multi-source join in findAll and subquery', () =>
    withSchema(async ({ schema }) => {
      const { Node, Tag } = await setup(schema);
      const options = {
        attributes: ['name'],
        from: { t: Tag },
        where: { id: col('t.NodeId') },
        order: [['name', 'ASC']] as [string, string][],
      };
      expect(await Node.findAll({ ...options, raw: true })).toHaveLength(3);
      const rows = await Node.findAll({ ...options, selectDistinct: true, raw: true });
      expect(names(rows)).toEqual(['child', 'root']);
      const outer = await Node.findAll({
        where: {
          name: {
            [Op.in]: Node.subquery({
              attributes: ['name'],
              from: { t: Tag },
              where: { id: col('t.NodeId') },
              selectDistinct: true,
            }),
          },
        },
        order: [['id', 'ASC']],
        raw: true,
      });
      expect(names(outer)).toEqual(['root', 'child']);
    }));

  it('applies to the joined rows of an include, also with limit', () =>
    withSchema(async ({ schema }) => {
      const { Node, Tag } = await setup(schema);
      const include = [{ model: Tag, attributes: [], required: true }];
      const logged: string[] = [];
      for (const limit of [undefined, 5]) {
        const rows = await Node.findAll({
          attributes: ['name'],
          include,
          selectDistinct: true,
          order: [['name', 'ASC']],
          raw: true,
          logging: (sql) => logged.push(sql),
          ...(limit === undefined ? {} : { limit }),
        });
        expect(new Set(names(rows))).toEqual(new Set(['child', 'root']));
      }
      expect(logged.every((sql) => sql.startsWith('Executing (default): SELECT DISTINCT '))).toBe(
        true,
      );
    }));
});

describe('IS [NOT] DISTINCT FROM between rows', () => {
  it('treats NULL as a value', () =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      const pair = tuple(col('a'), col('b'));
      const same = await Node.findAll({
        where: where(pair, Op.isNotDistinctFrom, tuple(1, null)),
        raw: true,
      });
      const differ = await Node.findAll({
        where: where(pair, Op.isDistinctFrom, tuple(1, null)),
        order: [['id', 'ASC']],
        raw: true,
      });
      expect(names(same)).toEqual(['root']);
      expect(names(differ)).toEqual(['child', 'leaf', 'other']);
    }));
});

describe('CASE and computed ORDER BY', () => {
  const rank = caseWhen()
    .when({ name: 'leaf' }, 2)
    .when({ a: { [Op.gte]: 5 } }, 10)
    .else(30);

  it('selects, filters and orders by a numeric rank', () =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      const rows = await Node.findAll({
        attributes: ['name', [rank, 'rank']],
        where: where(rank, Op.lt, 30),
        order: [[rank, 'ASC']],
        raw: true,
      });
      expect(rows).toEqual([
        { name: 'leaf', rank: 2 },
        { name: 'other', rank: 10 },
      ]);
    }));

  it('orders by an expression with DESC NULLS LAST, also through an include with limit', () =>
    withSchema(async ({ schema }) => {
      const { Node, Tag } = await setup(schema);
      const computed = fn('nullif', col('Node.a'), col('Node.b'));
      const plain = await Node.findAll({
        order: [
          [fn('coalesce', col('a'), col('b')), 'DESC NULLS LAST'],
          ['id', 'ASC'],
        ],
        raw: true,
      });
      expect(names(plain)).toEqual(['other', 'root', 'child', 'leaf']);
      const included = await Node.findAll({
        include: [Tag],
        order: [
          [computed, 'DESC NULLS LAST'],
          [caseWhen().when({ name: 'other' }, 0).else(1), 'ASC'],
          ['id', 'ASC'],
        ],
        limit: 2,
      });
      expect(included.map((row) => row.get('name'))).toEqual(['root', 'child']);
    }));

  it('orders DISTINCT rows by the alias of a selected CASE', () =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      const rows = await Node.findAll({
        attributes: [[rank, 'rank']],
        selectDistinct: true,
        order: [[col('rank'), 'DESC']],
        raw: true,
      });
      expect(rows).toEqual([{ rank: 30 }, { rank: 10 }, { rank: 2 }]);
    }));
});
