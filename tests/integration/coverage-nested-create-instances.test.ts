import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Posts" (id SERIAL PRIMARY KEY, title TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Comments" (id SERIAL PRIMARY KEY, body TEXT, "PostId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);`;

const inSchema = <T>(run: (sequelize: Sequelize) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query(SCHEMA);
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    return run(sequelize);
  });

describe('nested create with built instances', () => {
  it('saves a built instance given for a to-one child and links it', () =>
    inSchema(async (sequelize) => {
      const User = sequelize.define('User', { name: DataTypes.TEXT });
      const Post = sequelize.define('Post', { title: DataTypes.TEXT });
      Post.belongsTo(User);
      const author = User.build({ name: 'cid' });

      const post = await Post.create({ title: 'new', User: author } as never, {
        include: [User],
      });

      expect(post.get('UserId')).toBe(author.get('id'));
      expect(await User.count()).toBe(1);
      expect(await Post.findAll({ raw: true, attributes: ['title', 'UserId'] })).toEqual([
        { title: 'new', UserId: author.get('id') },
      ]);
    }));

  it('saves built instances and plain values given for to-many children', () =>
    inSchema(async (sequelize) => {
      const Post = sequelize.define('Post', { title: DataTypes.TEXT });
      const Comment = sequelize.define('Comment', { body: DataTypes.TEXT });
      Post.hasMany(Comment);
      const built = Comment.build({ body: 'from instance' });

      const post = await Post.create(
        { title: 'new', Comments: [built, { body: 'from values' }] } as never,
        {
          include: [Comment],
        },
      );

      const rows = (await Comment.findAll({
        raw: true,
        order: [['body', 'ASC']],
      })) as unknown as Record<string, unknown>[];
      expect(rows.map((row) => [row['body'], row['PostId']])).toEqual([
        ['from instance', post.get('id')],
        ['from values', post.get('id')],
      ]);
    }));
});
