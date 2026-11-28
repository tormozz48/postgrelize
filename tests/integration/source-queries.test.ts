import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  cast,
  col,
  exists,
  fn,
  literal,
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
  const User = sequelize.define(
    'User',
    { name: DataTypes.TEXT, refs: DataTypes.JSONB, extra: DataTypes.JSONB },
    { timestamps: false },
  );
  const Post = sequelize.define(
    'Post',
    { userId: DataTypes.INTEGER, title: DataTypes.TEXT, score: DataTypes.INTEGER },
    { timestamps: false },
  );
  User.hasMany(Post, { foreignKey: 'userId' });
  await sequelize.sync();
  await User.bulkCreate([
    { name: 'ann', refs: [{ id: 'a' }], extra: [{ id: 'b' }] },
    { name: 'bob', refs: [{ id: 'c' }], extra: [] },
    { name: 'cyd', refs: [], extra: [] },
  ]);
  await Post.bulkCreate([
    { userId: 1, title: 'p1', score: 1 },
    { userId: 1, title: 'p2', score: 5 },
    { userId: 2, title: 'p3', score: 2 },
  ]);
  return { sequelize, User, Post };
};

const unnest = (ids: number[]) => ({
  function: 'unnest',
  args: [cast(ids, 'integer[]')],
  columns: ['id'],
});

const names = (rows: readonly { get(key: string): unknown }[]) =>
  rows.map((row) => row.get('name'));

describe('queries over non-model sources', () => {
  it('reads unnest and multi-array unnest, including an empty array', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const rows = await sequelize.select({
        from: { ids: unnest([3, 1, 2]) },
        where: { '$ids.id$': { [Op.lt]: 3 } },
        order: [[col('ids.id'), 'ASC']],
      });
      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
      expect(await sequelize.select({ from: { ids: unnest([]) } })).toEqual([]);
      const pairs = await sequelize.select<{ a: number; b: Date }>({
        from: {
          t: {
            function: 'unnest',
            args: [
              cast([1, 2], 'integer[]'),
              cast([new Date('2026-01-01T00:00:00Z'), null], 'timestamptz[]'),
            ],
            columns: ['a', 'b'],
          },
        },
        order: ['t.a'],
      });
      expect(pairs).toEqual([
        { a: 1, b: new Date('2026-01-01T00:00:00Z') },
        { a: 2, b: null },
      ]);
    }));

  it('reads generate_series of dates', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const rows = await sequelize.select({
        from: {
          day: {
            function: 'generate_series',
            args: [
              cast('2026-01-01', 'date'),
              cast('2026-01-03', 'date'),
              cast('1 day', 'interval'),
            ],
          },
        },
        attributes: [[fn('to_char', col('day.day'), 'YYYY-MM-DD'), 'date']],
      });
      expect(rows.map((row) => row['date'])).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    }));

  it('joins a source to a model finder and to count', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const options = {
        joins: { ids: { source: unnest([2, 3]), on: { id: col('ids.id') } } },
      };
      expect(names(await User.findAll({ ...options, order: [[col('ids.id'), 'DESC']] }))).toEqual([
        'cyd',
        'bob',
      ]);
      expect(await User.count(options)).toBe(2);
      await expect(User.findAll({ ...options, include: ['Posts'] })).rejects.toThrow(
        'joins cannot be combined with a joined include',
      );
      await expect(User.count({ ...options, include: ['Posts'] })).rejects.toThrow(
        'joins cannot be combined with a joined include',
      );
    }));

  it('joins jsonb functions and tests them in exists()', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, User } = await setup(schema);
      const refs = {
        function: 'jsonb_array_elements',
        args: [fn('jsonb_concat', col('User.refs'), col('User.extra'))],
        columns: ['value'],
      };
      const joined = await User.findAll({
        attributes: ['name', [literal(`"ref"."value" ->> 'id'`), 'ref']],
        joins: { ref: { source: refs } },
        order: [
          ['id', 'ASC'],
          [col('ref.value'), 'ASC'],
        ],
        raw: true,
      });
      expect(joined).toEqual([
        { name: 'ann', ref: 'a' },
        { name: 'ann', ref: 'b' },
        { name: 'bob', ref: 'c' },
      ]);
      const matching = await User.findAll({
        where: exists(
          sequelize.subquery({
            from: { ref: refs },
            where: where(literal(`"ref"."value" ->> 'id'`), 'b'),
          }),
        ),
      });
      expect(names(matching)).toEqual(['ann']);
      const keys = await sequelize.select({
        from: {
          k: {
            function: 'jsonb_object_keys',
            args: [cast('{"x":1,"y":2}', 'jsonb')],
            columns: ['key'],
          },
        },
        joins: {
          e: {
            source: {
              function: 'jsonb_each',
              args: [cast('{"x":1,"y":2}', 'jsonb')],
              columns: ['key', 'value'],
            },
            on: where(col('e.key'), col('k.key')),
          },
        },
        attributes: ['e.key', 'e.value'],
        order: ['k.key'],
      });
      expect(keys).toEqual([
        { key: 'x', value: 1 },
        { key: 'y', value: 2 },
      ]);
    }));

  it('selects from bound VALUES', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const rows = await sequelize.select({
        from: {
          v: {
            values: {
              columns: ['a', 'b'],
              rows: [
                [cast(1, 'integer'), "x'; --"],
                [cast(2, 'integer'), 'y'],
              ],
            },
          },
        },
        where: { '$v.a$': 1 },
      });
      expect(rows).toEqual([{ a: 1, b: "x'; --" }]);
    }));

  it('left and inner joins a LATERAL subquery that references the outer alias', () =>
    withSchema(async ({ schema }) => {
      const { User, Post } = await setup(schema);
      const best = {
        lateral: Post.subquery({
          attributes: ['title'],
          where: { userId: col('User.id') },
          order: [[literal('"score" * -1'), 'ASC']],
          limit: 1,
        }),
      };
      const find = (type: 'left' | 'inner') =>
        User.findAll({
          attributes: ['name', [col('best.title'), 'title']],
          joins: { best: { type, source: best } },
          order: [['id', 'ASC']],
          raw: true,
        });
      expect(await find('left')).toEqual([
        { name: 'ann', title: 'p2' },
        { name: 'bob', title: 'p3' },
        { name: 'cyd', title: null },
      ]);
      expect(await find('inner')).toHaveLength(2);
    }));

  it('feeds insertFrom, inside a transaction', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, Post } = await setup(schema);
      await sequelize.transaction(async (transaction) => {
        const source = sequelize.subquery({
          from: {
            t: {
              function: 'unnest',
              args: [cast([2, 3], 'integer[]'), cast(['n1', 'n2'], 'text[]')],
              columns: ['userId', 'title'],
            },
          },
          attributes: ['t.userId', 't.title'],
        });
        await Post.insertFrom(source, { columns: ['userId', 'title'], transaction });
        const inside = await sequelize.select({
          from: { p: Post },
          where: { '$p.title$': { [Op.like]: 'n%' } },
          transaction,
        } as Parameters<typeof sequelize.select>[0]);
        expect(inside).toHaveLength(2);
      });
    }));
});
