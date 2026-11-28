import { DataTypes, cast, col, exists, fn, literal, where, type Sequelize } from 'postgrelize';

const check = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected result: ${JSON.stringify(actual)}`);
  }
};

export const run = async (sequelize: Sequelize): Promise<void> => {
  const User = sequelize.define(
    'User',
    { name: DataTypes.TEXT, refs: DataTypes.JSONB, extraRefs: DataTypes.JSONB },
    { timestamps: false },
  );
  const Post = sequelize.define(
    'Post',
    { userId: DataTypes.INTEGER, title: DataTypes.TEXT, score: DataTypes.INTEGER },
    { timestamps: false },
  );
  await sequelize.sync();
  await User.bulkCreate([
    { name: 'ann', refs: [{ id: 'a' }], extraRefs: [{ id: 'b' }] },
    { name: 'bob', refs: [], extraRefs: [] },
  ]);
  await Post.bulkCreate([
    { userId: 1, title: 'low', score: 1 },
    { userId: 1, title: 'high', score: 5 },
  ]);

  // #region main-source
  const ids = {
    function: 'unnest',
    args: [cast([2, 1], 'integer[]')],
    columns: ['id'],
  };
  const sorted = await sequelize.select({ from: { ids }, order: [[col('ids.id'), 'ASC']] });
  // SELECT * FROM unnest(CAST($1 AS integer[])) AS "ids"("id") ORDER BY "ids"."id" ASC

  const days = await sequelize.select({
    from: {
      day: {
        function: 'generate_series',
        args: [cast('2026-01-01', 'date'), cast('2026-01-03', 'date'), cast('1 day', 'interval')],
      },
    },
    attributes: [[fn('to_char', col('day.day'), 'MM-DD'), 'date']],
  });

  const letters = await sequelize.select({
    from: {
      v: {
        values: {
          columns: ['n', 'letter'],
          rows: [
            [cast(1, 'integer'), 'a'],
            [cast(2, 'integer'), 'b'],
          ],
        },
      },
    },
    where: { '$v.n$': 2 },
  });
  // #endregion main-source
  check(sorted, [{ id: 1 }, { id: 2 }]);
  check(days, [{ date: '01-01' }, { date: '01-02' }, { date: '01-03' }]);
  check(letters, [{ n: 2, letter: 'b' }]);

  // #region joins
  const listed = await User.findAll({
    joins: { ids: { source: ids, on: { id: col('ids.id') } } },
    order: [['id', 'ASC']],
  });

  const best = await User.findAll({
    attributes: ['name', [col('best.title'), 'title']],
    joins: {
      best: {
        type: 'left',
        source: {
          lateral: Post.subquery({
            attributes: ['title'],
            where: { userId: col('User.id') },
            order: [[fn('abs', col('Post.score')), 'DESC']],
            limit: 1,
          }),
        },
      },
    },
    order: [['id', 'ASC']],
    raw: true,
  });
  // LEFT OUTER JOIN LATERAL (SELECT … LIMIT 1) AS "best" ON true
  // #endregion joins
  check(
    listed.map((user) => user.get('name')),
    ['ann', 'bob'],
  );
  check(best, [
    { name: 'ann', title: 'high' },
    { name: 'bob', title: null },
  ]);

  // #region jsonb
  const refs = {
    function: 'jsonb_array_elements',
    args: [fn('jsonb_concat', col('User.refs'), col('User.extraRefs'))], // refs || extraRefs
    columns: ['ref'],
  };

  const pairs = await User.findAll({
    attributes: ['name', [literal(`"r"."ref" ->> 'id'`), 'ref']],
    joins: { r: { source: refs } },
    order: [[col('r.ref'), 'ASC']],
    raw: true,
  });

  const withB = await User.findAll({
    where: exists(
      sequelize.subquery({
        from: { r: refs },
        where: where(literal(`"r"."ref" ->> 'id'`), 'b'),
      }),
    ),
  });
  // #endregion jsonb
  check(pairs, [
    { name: 'ann', ref: 'a' },
    { name: 'ann', ref: 'b' },
  ]);
  check(
    withB.map((user) => user.get('name')),
    ['ann'],
  );

  // #region insert-from
  await Post.insertFrom(
    sequelize.subquery({
      from: {
        t: {
          function: 'unnest',
          args: [cast([2, 2], 'integer[]'), cast(['x', 'y'], 'text[]')],
          columns: ['userId', 'title'],
        },
      },
      attributes: ['t.userId', 't.title'],
    }),
    { columns: ['userId', 'title'] },
  );
  // #endregion insert-from
  check(await Post.count({ where: { userId: 2 } }), 2);
};
