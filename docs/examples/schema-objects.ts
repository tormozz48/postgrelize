import { DataTypes, Op, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();

  // #region extension
  await queryInterface.createExtension('pg_trgm', { ifNotExists: true });
  // #endregion extension

  // #region sequence
  await queryInterface.createSequence('invoice_number', { start: 1000, increment: 1 });
  const first = await queryInterface.nextval('invoice_number');
  await queryInterface.setval('invoice_number', 5000);
  const afterSet = await queryInterface.nextval('invoice_number');
  await queryInterface.alterSequence('invoice_number', { restartWith: 1, cycle: false });
  await queryInterface.dropSequence('invoice_number');
  // #endregion sequence

  await sequelize.query(
    'CREATE TABLE posts (id serial PRIMARY KEY, title text, "updatedAt" timestamptz, edits integer DEFAULT 0)',
  );

  // #region function-trigger
  await queryInterface.createFunction(
    'touch_post',
    [],
    'trigger',
    'plpgsql',
    'NEW."updatedAt" := now(); NEW.edits := OLD.edits + 1; RETURN NEW;',
    ['VOLATILE'],
    { force: true },
  );
  await queryInterface.createTrigger(
    'posts',
    'posts_touch',
    'before',
    ['update'],
    'touch_post',
    [],
    ['FOR EACH ROW', 'WHEN (OLD.title IS DISTINCT FROM NEW.title)'],
  );
  // #endregion function-trigger
  await sequelize.query("INSERT INTO posts (title) VALUES ('a')");
  await sequelize.query("UPDATE posts SET title = 'b'");
  await sequelize.query("UPDATE posts SET title = 'b'");
  const [post] = (await sequelize.query('SELECT edits FROM posts')) as [
    { edits: number }[],
    unknown,
  ];
  await queryInterface.dropTrigger('posts', 'posts_touch');
  await queryInterface.dropFunction('touch_post', []);

  // #region views
  await queryInterface.createView('edited_posts', 'SELECT id, title FROM posts WHERE edits > 0', {
    replace: true,
  });
  await queryInterface.createMaterializedView(
    'post_stats',
    'SELECT 1 AS k, count(*)::int AS posts, sum(edits)::int AS edits FROM posts',
  );
  await sequelize.query('CREATE UNIQUE INDEX post_stats_k ON post_stats (k)');
  await queryInterface.refreshMaterializedView('post_stats', { concurrently: true });
  // #endregion views
  const [stats] = (await sequelize.query('SELECT posts FROM post_stats')) as [
    { posts: number }[],
    unknown,
  ];
  await queryInterface.dropMaterializedView('post_stats');
  await queryInterface.dropView('edited_posts');

  // #region rls
  await queryInterface.enableRowLevelSecurity('posts', { force: true });
  await queryInterface.createPolicy('posts', 'edited_only', {
    command: 'select',
    using: { edits: { [Op.gt]: 0 } },
  });
  await queryInterface.alterPolicy('posts', 'edited_only', { using: 'edits >= 0' });
  // #endregion rls
  const policies = (await sequelize.query(
    "SELECT policyname FROM pg_policies WHERE tablename = 'posts'",
  )) as [{ policyname: string }[], unknown];
  await queryInterface.dropPolicy('posts', 'edited_only');
  await queryInterface.disableRowLevelSecurity('posts', { noForce: true });

  // #region persistence
  const Cache = sequelize.define(
    'Cache',
    { key: DataTypes.TEXT },
    { tableName: 'cache', unlogged: true },
  );
  await Cache.sync();
  await sequelize.transaction(async (transaction) => {
    await queryInterface.createTable(
      'scratch',
      { n: DataTypes.INTEGER },
      { temporary: true, transaction },
    );
    await sequelize.query('INSERT INTO scratch (n) VALUES (1)', { transaction });
  });
  // #endregion persistence
  const [cache] = (await sequelize.query(
    "SELECT relpersistence FROM pg_class WHERE relname = 'cache'",
  )) as [{ relpersistence: string }[], unknown];

  await queryInterface.dropExtension('pg_trgm');
  if (
    first !== '1000' ||
    afterSet !== '5001' ||
    post[0]?.edits !== 1 ||
    stats[0]?.posts !== 1 ||
    policies[0][0]?.policyname !== 'edited_only' ||
    cache[0]?.relpersistence !== 'u'
  ) {
    throw new Error('schema objects example: unexpected result');
  }
};
