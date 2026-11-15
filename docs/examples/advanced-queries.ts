import {
  DataTypes,
  Op,
  col,
  exists,
  fn,
  notExists,
  over,
  tuple,
  where,
  type Sequelize,
} from 'postgrelize';

const names = (rows: readonly { get: (key: string) => unknown }[], key = 'name'): string =>
  rows.map((row) => String(row.get(key))).join(',');

export const run = async (sequelize: Sequelize): Promise<void> => {
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Post = sequelize.define('Post', {
    title: DataTypes.TEXT,
    rank: DataTypes.INTEGER,
    published: DataTypes.BOOLEAN,
  });
  const Category = sequelize.define(
    'Category',
    { name: DataTypes.TEXT, parentId: DataTypes.INTEGER },
    { timestamps: false },
  );
  User.hasMany(Post);
  Post.belongsTo(User);
  await sequelize.sync();
  await User.bulkCreate([{ name: 'ann' }, { name: 'bob' }, { name: 'cid' }]);
  await Post.bulkCreate([
    { title: 'a1', rank: 3, published: true, UserId: 1 },
    { title: 'a2', rank: 1, published: false, UserId: 1 },
    { title: 'b1', rank: 2, published: true, UserId: 2 },
    { title: 'b2', rank: 5, published: true, UserId: 2 },
  ]);
  await Category.bulkCreate([
    { name: 'root', parentId: null },
    { name: 'a', parentId: 1 },
    { name: 'b', parentId: 1 },
    { name: 'a1', parentId: 2 },
    { name: 'a1x', parentId: 4 },
  ]);

  // #region subquery
  const authors = await User.findAll({
    where: {
      id: { [Op.in]: Post.subquery({ attributes: ['UserId'], where: { published: true } }) },
    },
    order: [['id', 'ASC']],
  });

  const counted = await User.findAll({
    attributes: [
      'name',
      [
        Post.subquery({
          attributes: [[fn('count', col('Post.id')), 'n']],
          where: { UserId: col('User.id') },
        }),
        'postCount',
      ],
    ],
    order: [['id', 'ASC']],
    raw: true,
  });
  // counted: [{ name: 'ann', postCount: '2' }, { name: 'bob', postCount: '2' }, { name: 'cid', postCount: '0' }]
  // #endregion subquery

  // #region exists
  const postsOf = (extra: object) =>
    Post.subquery({ attributes: ['id'], where: { UserId: col('User.id'), ...extra } });

  const highRanked = await User.findAll({ where: exists(postsOf({ rank: { [Op.gte]: 5 } })) });
  const silent = await User.findAll({ where: notExists(postsOf({})) });
  // highRanked: bob; silent: cid
  // #endregion exists

  // #region distinct-on
  const topPerUser = await Post.findAll({
    distinctOn: ['UserId'],
    order: [
      ['UserId', 'ASC'],
      ['rank', 'DESC'],
    ],
  });
  // topPerUser: a1, b2
  // #endregion distinct-on

  // #region window
  const ranked = await Post.findAll({
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
  // ranked: a1 → '1', a2 → '2', b1 → '2', b2 → '1'
  // #endregion window

  // #region keyset
  const nextPage = await Post.findAll({
    where: where(tuple(col('rank'), col('id')), Op.lt, tuple(3, 1)),
    order: [
      ['rank', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 10,
  });
  // nextPage: b1, a2 — rows after (rank 3, id 1) in (rank DESC, id DESC) order
  // #endregion keyset

  // #region recursive-cte
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
  // subtree: a, a1, a1x — Category instances read from the CTE
  // #endregion recursive-cte

  // #region cte
  const rootChildren = await Category.count({
    with: {
      roots: {
        query: Category.subquery({ attributes: ['id'], where: { parentId: null } }),
        materialized: true,
      },
    },
    where: {
      parentId: { [Op.in]: Category.subquery({ attributes: ['id'], source: 'roots' }) },
    },
  });
  // rootChildren === 2
  // #endregion cte

  // #region set-operations
  const published = Post.subquery({ attributes: [['UserId', 'id']], where: { published: true } });
  const withoutPosts = await User.findAll({
    where: { id: { [Op.in]: User.subquery({ attributes: ['id'] }).except(published) } },
  });
  // withoutPosts: cid

  const pair = await User.findAll({
    source: User.subquery({ where: { name: 'ann' } }).union(
      User.subquery({ where: { name: 'cid' } }),
    ),
    order: [['name', 'DESC']],
  });
  // pair: cid, ann — rows of the UNION, read as User instances
  // #endregion set-operations

  // #region with-ties
  const topPublished = await Post.findAll({
    order: [['published', 'DESC']],
    limit: 1,
    withTies: true,
  });
  // topPublished: a1, b1, b2 — every row that ties with the first on `published`
  // #endregion with-ties

  // #region find-each
  const seen: string[] = [];
  for await (const post of Post.findEach({ order: [['id', 'ASC']] }, { batchSize: 2 })) {
    seen.push(String(post.get('title')));
  }
  // seen: a1, a2, b1, b2 — fetched two rows at a time through a server-side cursor
  // #endregion find-each

  const actual = JSON.stringify([
    names(authors),
    counted,
    names(highRanked),
    names(silent),
    names(topPerUser, 'title'),
    ranked,
    names(nextPage, 'title'),
    names(subtree),
    rootChildren,
    names(withoutPosts),
    names(pair),
    names(topPublished, 'title').split(',').toSorted().join(','),
    seen.join(','),
  ]);
  const expected = JSON.stringify([
    'ann,bob',
    [
      { name: 'ann', postCount: '2' },
      { name: 'bob', postCount: '2' },
      { name: 'cid', postCount: '0' },
    ],
    'bob',
    'cid',
    'a1,b2',
    [
      { title: 'a1', position: '1' },
      { title: 'a2', position: '2' },
      { title: 'b1', position: '2' },
      { title: 'b2', position: '1' },
    ],
    'b1,a2',
    'a,a1,a1x',
    2,
    'cid',
    'cid,ann',
    'a1,b1,b2',
    'a1,a2,b1,b2',
  ]);
  if (actual !== expected) {
    throw new Error(`advanced-queries example: unexpected result ${actual}`);
  }
};
