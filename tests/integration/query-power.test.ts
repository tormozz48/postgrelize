import { parameterizedSql } from '../support/parameterized-log.ts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  col,
  exists,
  fn,
  notExists,
  over,
  tuple,
  where,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = (schema: string) => {
  const logged: string[] = [];
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: (_sql, options) => logged.push(parameterizedSql(options)),
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Post = sequelize.define('Post', {
    title: DataTypes.TEXT,
    rank: DataTypes.INTEGER,
    published: DataTypes.BOOLEAN,
  });
  User.hasMany(Post);
  Post.belongsTo(User);
  return { sequelize, User, Post, logged };
};

const withData = <T>(run: (models: ReturnType<typeof setup>) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema }) => {
    const models = setup(schema);
    await models.sequelize.sync();
    await models.User.bulkCreate([{ name: 'ann' }, { name: 'bob' }, { name: 'cid' }]);
    await models.Post.bulkCreate([
      { title: 'a1', rank: 3, published: true, UserId: 1 },
      { title: 'a2', rank: 1, published: false, UserId: 1 },
      { title: 'b1', rank: 2, published: true, UserId: 2 },
      { title: 'b2', rank: 5, published: true, UserId: 2 },
    ]);
    return run(models);
  });

const names = (rows: readonly { get: (key: string) => unknown }[]) =>
  rows.map((row) => row.get('name'));

describe('subqueries', () => {
  it('filters with IN (subquery) and scalar subqueries in attributes', () =>
    withData(async ({ User, Post, logged }) => {
      const published = await User.findAll({
        where: {
          id: { [Op.in]: Post.subquery({ attributes: ['UserId'], where: { published: true } }) },
        },
        order: [['id', 'ASC']],
      });
      expect(names(published)).toEqual(['ann', 'bob']);
      expect(logged.at(-1)).toContain(
        'IN (SELECT "Post"."UserId" FROM "Posts" AS "Post" WHERE "Post"."published" = $1)',
      );
      const counted = await User.findAll({
        attributes: [
          'name',
          [
            Post.subquery({
              attributes: [[fn('count', col('Post.id')), 'n']],
              where: { UserId: col('User.id') },
              as: 'Post',
            }),
            'postCount',
          ],
        ],
        order: [['id', 'ASC']],
        raw: true,
      });
      expect(counted).toEqual([
        { name: 'ann', postCount: '2' },
        { name: 'bob', postCount: '2' },
        { name: 'cid', postCount: '0' },
      ]);
    }));

  it('supports EXISTS / NOT EXISTS with correlated subqueries', () =>
    withData(async ({ User, Post }) => {
      const correlated = (extra: object) =>
        Post.subquery({ attributes: ['id'], where: { UserId: col('User.id'), ...extra } });
      expect(
        names(await User.findAll({ where: exists(correlated({ rank: { [Op.gte]: 5 } })) })),
      ).toEqual(['bob']);
      expect(
        names(await User.findAll({ where: notExists(correlated({})), order: [['id', 'ASC']] })),
      ).toEqual(['cid']);
      expect(
        await User.count({
          where: { [Op.or]: [exists(correlated({ published: false })), { name: 'cid' }] },
        }),
      ).toBe(2);
    }));
});

describe('DISTINCT ON, window functions, row comparison', () => {
  it('returns the top post per user with DISTINCT ON', () =>
    withData(async ({ Post }) => {
      const top = await Post.findAll({
        distinctOn: ['UserId'],
        order: [
          ['UserId', 'ASC'],
          ['rank', 'DESC'],
        ],
      });
      expect(top.map((post) => post.get('title'))).toEqual(['a1', 'b2']);
    }));

  it('ranks rows with window functions', () =>
    withData(async ({ Post }) => {
      const rows = await Post.findAll({
        attributes: [
          'title',
          [
            over(fn('row_number'), { partitionBy: ['UserId'], orderBy: [['rank', 'DESC']] }),
            'position',
          ],
        ],
        order: [['title', 'ASC']],
        raw: true,
      });
      expect(rows).toEqual([
        { title: 'a1', position: '1' },
        { title: 'a2', position: '2' },
        { title: 'b1', position: '2' },
        { title: 'b2', position: '1' },
      ]);
    }));

  it('paginates with row comparison (keyset)', () =>
    withData(async ({ Post }) => {
      const page = await Post.findAll({
        where: where(tuple(col('rank'), col('id')), Op.lt, tuple(3, 1)),
        order: [
          ['rank', 'DESC'],
          ['id', 'DESC'],
        ],
      });
      expect(page.map((post) => post.get('title'))).toEqual(['b1', 'a2']);
      expect(() => over(fn('rank'), { orderBy: [['rank', 'SIDEWAYS']] })).not.toThrow();
      await expect(
        Post.findAll({
          attributes: [[over(fn('rank'), { orderBy: [['rank', 'SIDEWAYS']] }), 'r']],
        }),
      ).rejects.toThrow(/Invalid order direction/);
    }));
});
