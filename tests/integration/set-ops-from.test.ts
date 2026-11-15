import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize } from '../../src/index.ts';
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
