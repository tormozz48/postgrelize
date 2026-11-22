import { ConnectionError, DataTypes, Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const { host, port, database, username, password } = sequelize.config;
  const dialectOptions = sequelize.options.dialectOptions;
  const url = `postgres://${username}:${password}@${host}:${port}/${database}`;

  // #region url
  const fromUrl = new Sequelize(url, { logging: false, dialectOptions });
  await fromUrl.authenticate(); // throws a ConnectionError subclass when the server is unreachable
  await fromUrl.close();
  // #endregion url

  // #region options
  const fromOptions = new Sequelize({
    host,
    port,
    database,
    username,
    password,
    dialectOptions,
    logging: false,
    timezone: '+00:00', // session time zone, the default
    define: { underscored: true, freezeTableName: true }, // defaults for every model
    pool: { max: 10, idle: 10_000, acquire: 30_000 },
  });
  // #endregion options

  // #region logging
  const statements: string[] = [];
  const logged = new Sequelize({
    host,
    port,
    database,
    username,
    password,
    dialectOptions,
    logging: (sql) => statements.push(sql), // called with the SQL text of every query
    benchmark: true, // also pass the duration in ms as the second argument
  });
  await logged.query('SELECT 1');
  await logged.close();
  // #endregion logging

  // #region statement-cache
  const cached = new Sequelize({
    host,
    port,
    database,
    username,
    password,
    dialectOptions,
    logging: false,
    statementCache: { max: 50 }, // postgrelize extension: named prepared statements, 50 per connection
    inAsAnyThreshold: 50, // postgrelize extension: IN lists of 50+ values compile to = ANY($1)
  });
  // #endregion statement-cache

  // #region lifecycle
  const Note = fromOptions.define('Note', { body: DataTypes.TEXT });
  await Note.sync({ force: true }); // freezeTableName: the table is "Note", columns are snake_case
  const { size, using } = fromOptions.connectionManager.pool; // live pool counters
  await fromOptions.close(); // call it on shutdown; pending connections are closed
  // #endregion lifecycle

  const unreachable = new Sequelize({
    host: '127.0.0.1',
    port: 1,
    database: 'x',
    username: 'x',
    logging: false,
  });
  const failure = await unreachable.authenticate().catch((error: unknown) => error);
  await unreachable.close();
  if (
    !(failure instanceof ConnectionError) ||
    statements.length === 0 ||
    size < 1 ||
    using !== 0 ||
    cached.options.statementCache === undefined
  ) {
    throw new Error('connection example: unexpected result');
  }
  await cached.close();
};
