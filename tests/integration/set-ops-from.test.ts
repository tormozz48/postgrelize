import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, cast, col } from '../../src/index.ts';
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
  const User = sequelize.define(
    'User',
    { name: DataTypes.TEXT, score: DataTypes.INTEGER },
    { timestamps: false },
  );
  const Post = sequelize.define(
    'Post',
    { userId: DataTypes.INTEGER, title: DataTypes.TEXT },
    { timestamps: false },
  );
  const Comment = sequelize.define('Comment', { userId: DataTypes.INTEGER }, { timestamps: false });
  await sequelize.sync();
  await User.bulkCreate([
    { name: 'ann', score: 10 },
    { name: 'bob', score: 10 },
    { name: 'cyd', score: 7 },
    { name: 'dan', score: 3 },
  ]);
  await Post.bulkCreate([
    { userId: 1, title: 'p1' },
    { userId: 1, title: 'p2' },
    { userId: 2, title: 'p3' },
  ]);
  await Comment.bulkCreate([{ userId: 2 }, { userId: 3 }]);
  return { sequelize, User, Post, Comment, logged };
};

type Row = Record<string, unknown>;

const names = (rows: readonly { get(key: string): unknown }[]): unknown[] =>
  rows.map((row) => row.get('name'));

describe('set operations', () => {
  it('combines subqueries with UNION, INTERSECT and EXCEPT in IN filters', () =>
    withSchema(async ({ schema }) => {
      const { User, Post, Comment } = await setup(schema);
      const posts = Post.subquery({ attributes: ['userId'] });
      const comments = Comment.subquery({ attributes: ['userId'] });
      const find = (ids: typeof posts) =>
        User.findAll({ where: { id: { [Op.in]: ids } }, order: [['id', 'ASC']] });
      expect(names(await find(posts.union(comments)))).toEqual(['ann', 'bob', 'cyd']);
      expect(names(await find(posts.intersect(comments)))).toEqual(['bob']);
      expect(names(await find(posts.except(comments)))).toEqual(['ann']);
    }));

  it('keeps duplicates with all: true', () =>
    withSchema(async ({ schema }) => {
      const { Post, Comment } = await setup(schema);
      const ids = Post.subquery({ attributes: ['userId'] });
      const all = ids.union(Comment.subquery({ attributes: ['userId'] }), { all: true });
      const rows = await Post.findAll({
        source: all,
        attributes: ['userId'],
        raw: true,
        order: [['userId', 'ASC']],
      });
      expect(rows.map((row) => (row as unknown as Record<string, unknown>)['userId'])).toEqual([
        1, 1, 2, 2, 3,
      ]);
    }));

  it('reads model rows from a set operation with order and limit of the finder', () =>
    withSchema(async ({ schema }) => {
      const { User, logged } = await setup(schema);
      const high = User.subquery({ where: { score: { [Op.gte]: 10 } } });
      const low = User.subquery({ where: { score: { [Op.lt]: 5 } } });
      const rows = await User.findAll({
        source: high.union(low),
        order: [['name', 'DESC']],
        limit: 2,
      });
      expect(names(rows)).toEqual(['dan', 'bob']);
      expect(rows[0]).toBeInstanceOf(User);
      expect(logged.at(-1)).toContain('UNION');
      expect(logged.at(-1)).toContain('AS "User"');
    }));

  it('chains set operations and counts over them', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const a = User.subquery({ where: { name: 'ann' } });
      const b = User.subquery({ where: { name: 'bob' } });
      const c = User.subquery({ where: { name: 'ann' } });
      expect(await User.count({ source: a.union(b).except(c) })).toBe(1);
    }));

  it('uses a combined query as a CTE body', () =>
    withSchema(async ({ schema }) => {
      const { User, Post, Comment } = await setup(schema);
      const posts = Post.subquery({ attributes: [['userId', 'id']] });
      const comments = Comment.subquery({ attributes: [['userId', 'id']] });
      const both = posts.union(comments);
      const rows = await User.findAll({
        with: { active: both },
        where: { id: { [Op.in]: User.subquery({ attributes: ['id'], source: 'active' }) } },
        order: [['id', 'ASC']],
      });
      expect(names(rows)).toEqual(['ann', 'bob', 'cyd']);
    }));
});

describe('FETCH FIRST ... WITH TIES', () => {
  it('returns rows that tie with the last one', () =>
    withSchema(async ({ schema }) => {
      const { User, logged } = await setup(schema);
      const rows = await User.findAll({
        order: [['score', 'DESC']],
        limit: 1,
        withTies: true,
      });
      expect(names(rows).toSorted()).toEqual(['ann', 'bob']);
      expect(logged.at(-1)).toContain('FETCH FIRST $1 ROWS WITH TIES');
      expect(await User.findAll({ order: [['score', 'DESC']], limit: 1 })).toHaveLength(1);
    }));

  it('requires a limit', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      await expect(User.findAll({ order: ['score'], withTies: true })).rejects.toThrow(
        'withTies requires a limit',
      );
    }));
});

const serverVersion = async (sequelize: Sequelize): Promise<number> =>
  Number(
    (
      (await sequelize.query('SHOW server_version_num', { type: 'SELECT', plain: true })) as {
        server_version_num: string;
      }
    ).server_version_num,
  );

describe('FROM sources', () => {
  it('joins a VALUES list to model rows', () =>
    withSchema(async ({ schema }) => {
      const { User, logged } = await setup(schema);
      const rows = await User.findAll({
        from: {
          v: {
            values: {
              columns: ['id', 'rank'],
              rows: [
                [cast(2, 'integer'), 1],
                [cast(1, 'integer'), 2],
              ],
            },
          },
        },
        where: { id: col('v.id') },
        order: [[col('v.rank'), 'ASC']],
      });
      expect(names(rows)).toEqual(['bob', 'ann']);
      expect(logged.at(-1)).toContain('(VALUES (CAST($1 AS integer), $2)');
    }));

  it('reads from set-returning functions, with ordinality', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const rows = await User.findAll({
        attributes: ['name', [col('g.ord'), 'position']],
        from: {
          g: {
            function: 'unnest',
            args: [cast([4, 3, 2, 1], 'integer[]')],
            columns: ['key'],
            ordinality: 'ord',
          },
        },
        where: { id: col('g.key') },
        order: [[col('g.ord'), 'ASC']],
        raw: true,
      });
      expect((rows as unknown as Row[]).map((row) => [row['name'], row['position']])).toEqual([
        ['dan', '1'],
        ['cyd', '2'],
        ['bob', '3'],
        ['ann', '4'],
      ]);
    }));

  it('correlates a LATERAL subquery with the model row', () =>
    withSchema(async ({ schema }) => {
      const { User, Post, logged } = await setup(schema);
      const rows = await User.findAll({
        attributes: ['name', [col('latest.title'), 'title']],
        from: {
          latest: {
            lateral: Post.subquery({
              attributes: ['title'],
              where: { userId: col('User.id') },
              order: [['id', 'DESC']],
              limit: 1,
            }),
          },
        },
        order: [['id', 'ASC']],
        raw: true,
      });
      expect((rows as unknown as Row[]).map((row) => [row['name'], row['title']])).toEqual([
        ['ann', 'p2'],
        ['bob', 'p3'],
      ]);
      expect(logged.at(-1)).toContain('LATERAL (SELECT');
    }));
});

describe('TABLESAMPLE', () => {
  it('samples the model table and keeps the percent bound', () =>
    withSchema(async ({ schema }) => {
      const { User, logged } = await setup(schema);
      expect(await User.count({ sample: { method: 'BERNOULLI', percent: 100 } })).toBe(4);
      expect(await User.findAll({ sample: { method: 'SYSTEM', percent: 0 } })).toHaveLength(0);
      const first = await User.findAll({ sample: { method: 'BERNOULLI', percent: 50, seed: 7 } });
      const again = await User.findAll({ sample: { method: 'BERNOULLI', percent: 50, seed: 7 } });
      expect(names(again)).toEqual(names(first));
      expect(logged.at(-1)).toContain('TABLESAMPLE BERNOULLI ($1) REPEATABLE ($2)');
    }));

  it('samples a from entry', () =>
    withSchema(async ({ schema }) => {
      const { User, Post } = await setup(schema);
      const rows = await User.count({
        from: { p: { model: Post, sample: { method: 'BERNOULLI', percent: 100 } } },
        where: { id: col('p.userId') },
      });
      expect(rows).toBe(3);
    }));

  it('rejects invalid sampling options', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const method = 'BERNOULLI; DROP TABLE canary' as never;
      await expect(User.findAll({ sample: { method, percent: 1 } })).rejects.toThrow(
        'Invalid TABLESAMPLE method',
      );
      await expect(User.findAll({ sample: { method: 'SYSTEM', percent: 101 } })).rejects.toThrow(
        'from 0 to 100',
      );
    }));
});

describe('JSON_TABLE', () => {
  it('turns a document into rows on PostgreSQL 17+', () =>
    withSchema(async ({ schema }) => {
      const { User, sequelize } = await setup(schema);
      const query = () =>
        User.findAll({
          attributes: ['name', [col('j.qty'), 'qty'], [col('j.n'), 'n'], [col('j.ok'), 'ok']],
          from: {
            j: {
              jsonTable: {
                doc: {
                  items: [
                    { id: 1, qty: 5 },
                    { id: 3, qty: 9 },
                  ],
                },
                path: '$.items[*]',
                columns: [
                  { name: 'n', ordinality: true },
                  { name: 'item', type: 'integer', path: '$.id' },
                  { name: 'qty', type: 'integer' },
                  { name: 'ok', exists: true, path: '$.qty' },
                ],
              },
            },
          },
          where: { id: col('j.item') },
          order: [['id', 'ASC']],
          raw: true,
        });
      const supported = (await serverVersion(sequelize)) >= 170000;
      const outcome = await query().then(
        (rows) =>
          (rows as unknown as Row[]).map((row) => [row['name'], row['qty'], row['n'], row['ok']]),
        () => 'rejected',
      );
      expect(outcome).toEqual(
        supported
          ? [
              ['ann', 5, 1, true],
              ['cyd', 9, 2, true],
            ]
          : 'rejected',
      );
    }));

  it('rejects columns without a type and unknown types', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const find = (columns: never) =>
        User.findAll({ from: { j: { jsonTable: { doc: {}, path: '$', columns } } } });
      await expect(find([{ name: 'a' }] as never)).rejects.toThrow('needs a type');
      await expect(find([{ name: 'a', type: 'text); DROP' }] as never)).rejects.toThrow(
        'Invalid cast type',
      );
    }));
});

describe('source option validation', () => {
  it('rejects inconsistent values and ordinality options', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const bad = (from: never) => User.findAll({ from });
      await expect(bad({ v: { values: { columns: ['a'], rows: [] } } } as never)).rejects.toThrow(
        'at least one',
      );
      await expect(
        bad({ v: { values: { columns: ['a', 'b'], rows: [[1]] } } } as never),
      ).rejects.toThrow('one cell per column');
      await expect(
        bad({ g: { function: 'generate_series', ordinality: 'n' } } as never),
      ).rejects.toThrow('needs columns');
    }));
});

describe('lateral include (top-N per parent)', () => {
  it('fetches only the first rows of each parent in the database', () =>
    withSchema(async ({ schema }) => {
      const { User, Post, logged } = await setup(schema);
      User.hasMany(Post, { foreignKey: 'userId' });
      await Post.bulkCreate([
        { userId: 1, title: 'p4' },
        { userId: 2, title: 'p5' },
      ]);
      const users = await User.findAll({
        include: [
          {
            association: 'Posts',
            separate: true,
            lateral: true,
            limit: 2,
            order: [['id', 'DESC']],
          },
        ],
        order: [['id', 'ASC']],
      });
      const titles = users.map((user) => [
        user.get('name'),
        (user.get('Posts') as { get(key: string): unknown }[]).map((post) => post.get('title')),
      ]);
      expect(titles).toEqual([
        ['ann', ['p4', 'p2']],
        ['bob', ['p5', 'p3']],
        ['cyd', []],
        ['dan', []],
      ]);
      const sql = logged.find((entry) => entry.includes('LATERAL')) ?? '';
      expect(sql).toContain('"unnest"(CAST($1 AS INTEGER[])) WITH ORDINALITY');
      expect(sql).toContain('INNER JOIN LATERAL (SELECT');
      expect(sql).toContain('LIMIT $2');
    }));

  it('requires a limit', () =>
    withSchema(async ({ schema }) => {
      const { User, Post } = await setup(schema);
      User.hasMany(Post, { foreignKey: 'userId' });
      await expect(
        User.findAll({ include: [{ association: 'Posts', separate: true, lateral: true }] }),
      ).rejects.toThrow('needs a limit');
    }));
});
