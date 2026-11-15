import { DataTypes, Op, QueryTypes, literal, type Sequelize } from 'postgrelize';

type Input = Readonly<Record<string, string>>;

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Post = sequelize.define('Post', { title: DataTypes.TEXT, rank: DataTypes.INTEGER });
  await sequelize.sync();
  await Post.bulkCreate([
    { title: "it's", rank: 2 },
    { title: 'plain', rank: 1 },
  ]);
  const input: Input = { title: "it's", search: "'; DROP TABLE posts; --", sort: 'rank' };

  // #region values
  // Values from users are always sent as bound parameters.
  const byTitle = await Post.findAll({ where: { title: input['title'] } });
  const searched = await Post.count({ where: { title: { [Op.iLike]: `%${input['search']}%` } } });
  // #endregion values

  // #region raw-query
  // Raw SQL: put user values in replacements or bind, never in the SQL text.
  const rows = (await sequelize.query('SELECT title FROM "Posts" WHERE title = :title', {
    type: QueryTypes.SELECT,
    replacements: { title: input['title'] },
  })) as { title: string }[];
  // #endregion raw-query

  // #region identifiers
  // Column names from users: map them through your own allowlist.
  const sortable = { rank: 'rank', title: 'title' } as const;
  const column = sortable[input['sort'] as keyof typeof sortable] ?? 'rank';
  const sorted = await Post.findAll({ order: [[column, 'DESC']] });
  // #endregion identifiers

  // #region literal
  // literal() is inserted as is: only constant SQL written by you.
  const nullsLast = await Post.findAll({ order: [literal('"rank" DESC NULLS LAST')] });
  // #endregion literal

  if (
    byTitle.length !== 1 ||
    searched !== 0 ||
    rows.length !== 1 ||
    sorted[0]?.get('title') !== "it's" ||
    nullsLast.length !== 2
  ) {
    throw new Error('security example: unexpected result');
  }
};
