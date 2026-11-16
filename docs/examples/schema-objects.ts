import type { Sequelize } from 'postgrelize';

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

  await queryInterface.dropExtension('pg_trgm');
  if (first !== '1000' || afterSet !== '5001' || post[0]?.edits !== 1) {
    throw new Error('schema objects example: unexpected result');
  }
};
