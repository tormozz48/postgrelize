import { DataTypes, Op, caseWhen, col, fn, tuple, where, type Sequelize } from 'postgrelize';

const titles = (rows: readonly unknown[]): string =>
  rows
    .map((row) => {
      const model = row as { title?: string; get?: (key: string) => unknown };
      return String(model.get === undefined ? model.title : model.get('title'));
    })
    .join(',');

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Task = sequelize.define(
    'Task',
    {
      title: DataTypes.TEXT,
      status: DataTypes.TEXT,
      due: DataTypes.INTEGER,
      done: DataTypes.INTEGER,
      children: DataTypes.ARRAY(DataTypes.INTEGER),
    },
    { timestamps: false },
  );
  const Comment = sequelize.define('Comment', { body: DataTypes.TEXT }, { timestamps: false });
  Task.hasMany(Comment);
  Comment.belongsTo(Task);
  await sequelize.sync();
  await Task.bulkCreate([
    { title: 'plan', status: 'done', due: 1, done: 1, children: [2] },
    { title: 'build', status: 'open', due: 5, done: null, children: [3] },
    { title: 'ship', status: 'blocked', due: null, done: null, children: [] },
  ]);
  await Comment.bulkCreate([
    { body: 'a', TaskId: 2 },
    { body: 'b', TaskId: 2 },
    { body: 'c', TaskId: 3 },
  ]);

  // #region case
  const rank = caseWhen()
    .when({ status: 'blocked' }, 1)
    .when({ status: 'open', due: { [Op.lt]: 10 } }, 2)
    .else(3);
  const ranked = await Task.findAll({
    attributes: ['title', [rank, 'rank']],
    where: where(rank, Op.lt, 3),
    order: [[rank, 'ASC']],
    raw: true,
  });
  // ranked: ship (1), build (2)
  // #endregion case

  // #region computed-order
  const latest = await Task.findAll({
    order: [[fn('coalesce', col('done'), col('due')), 'DESC NULLS LAST']],
  });
  // latest: build, plan, ship
  // #endregion computed-order

  // #region select-distinct
  const commented = await Task.findAll({
    attributes: ['title'],
    from: { c: Comment },
    where: { id: col('c.TaskId') },
    selectDistinct: true,
    order: [['title', 'ASC']],
    raw: true,
  });
  // commented: build, ship — one row per task, not one per comment
  // #endregion select-distinct

  // #region row-distinct
  const changed = await Task.findAll({
    where: where(tuple(col('due'), col('done')), Op.isDistinctFrom, tuple(1, 1)),
    order: [['id', 'ASC']],
  });
  // changed: build, ship — NULL compares as a value
  // #endregion row-distinct

  // #region array-walk
  const reachable = await Task.findAll({
    with: {
      walk: {
        query: Task.subquery({ where: { title: 'plan' } }),
        recursive: Task.subquery({
          from: { walk: 'walk' },
          where: { id: { [Op.any]: col('walk.children') } },
        }),
        materialized: false,
      },
    },
    source: 'walk',
    order: [['id', 'ASC']],
  });
  // reachable: plan, build, ship
  // #endregion array-walk

  const actual = [ranked, latest, commented, changed, reachable].map(titles).join(';');
  const expected = 'ship,build;build,plan,ship;build,ship;build,ship;plan,build,ship';
  if (actual !== expected) {
    throw new Error(`case-distinct example: unexpected result ${actual}`);
  }
};
