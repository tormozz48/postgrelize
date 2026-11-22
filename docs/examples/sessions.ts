import { AsyncLocalStorage } from 'node:async_hooks';
import { DataTypes, QueryTypes, Sequelize } from 'postgrelize';

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Job = sequelize.define('Job', { name: DataTypes.TEXT, state: DataTypes.TEXT });
  await sequelize.sync();

  // #region listen-notify
  const received: string[] = [];
  const unlisten = await sequelize.listen('jobs', (payload, channel) => {
    received.push(`${channel}: ${payload ?? ''}`);
  });

  await sequelize.notify('jobs', { id: 1 });
  await sequelize.transaction(async (transaction) => {
    await Job.create({ name: 'export', state: 'queued' }, { transaction });
    await sequelize.notify('jobs', 'export queued', { transaction }); // delivered on commit
  });
  await pause(200);
  await unlisten();
  // received: ['jobs: {"id":1}', 'jobs: export queued']
  // #endregion listen-notify

  // #region settings
  const user = await sequelize.transaction(
    { settings: { 'app.user_id': 42, statement_timeout: '5s' } },
    (transaction) =>
      sequelize.query("SELECT current_setting('app.user_id') AS id", {
        type: QueryTypes.SELECT,
        plain: true,
        transaction,
      }),
  );
  // user: { id: '42' }; the settings end with the transaction (SET LOCAL semantics)
  // #endregion settings

  // #region statement-timeout
  // Cancel just this query after 200 ms; the pooled connection keeps its normal timeout.
  const timedOut = await sequelize
    .query('SELECT pg_sleep(5)', { statementTimeout: 200 })
    .then(() => false)
    .catch(() => true);
  // #endregion statement-timeout
  if (!timedOut) {
    throw new Error('statementTimeout did not cancel the query');
  }

  // #region advisory-locks
  const holder = await sequelize.transaction();
  await holder.advisoryLock('jobs:42');

  const other = await sequelize.transaction();
  const busy = await other.tryAdvisoryLock('jobs:42'); // false: held by `holder`
  const free = await other.tryAdvisoryLock(7); // true: integer keys work too
  await holder.commit(); // transaction-level locks are released on commit / rollback
  await other.rollback();
  // #endregion advisory-locks

  // #region with-advisory-lock
  const order: string[] = [];
  let firstHoldsLock: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    firstHoldsLock = resolve;
  });
  await Promise.all([
    sequelize.withAdvisoryLock('nightly-report', async () => {
      order.push('first start');
      firstHoldsLock?.();
      await pause(100);
      order.push('first end');
    }),
    held.then(() =>
      sequelize.withAdvisoryLock('nightly-report', async () => {
        order.push('second');
      }),
    ),
  ]);
  // order: ['first start', 'first end', 'second']
  // #endregion with-advisory-lock

  // Read replicas: this example points readers and the writer at the same server.
  const { host, port, database, username, password } = sequelize.config;
  const replicated = new Sequelize({
    database,
    username,
    password,
    host,
    port,
    logging: false,
    dialectOptions: sequelize.options.dialectOptions,
    replication: {
      read: [
        { host, port },
        { host, port },
      ],
      write: { host, port },
    },
  });
  const Replicated = replicated.define('Job', { name: DataTypes.TEXT, state: DataTypes.TEXT });
  try {
    // #region replication
    const queued = await Replicated.count({ where: { state: 'queued' } }); // a reader
    const fresh = await Replicated.findAll({ where: { state: 'queued' }, useMaster: true }); // the writer
    await replicated.transaction(async (transaction) => {
      await Replicated.findAll({ transaction }); // the writer: transactions never use readers
    });
    // #endregion replication
    if (queued !== 1 || fresh.length !== 1) {
      throw new Error('sessions example: unexpected replication result');
    }
  } finally {
    await replicated.close();
  }

  // The second "database" is the same server under another application_name, so the example can
  // tell the two connections apart.
  const shard = new Sequelize({
    database,
    username,
    password,
    host,
    port,
    logging: false,
    dialectOptions: { ...sequelize.options.dialectOptions, application_name: 'shard-b' },
  });
  let routed: string[] = [];
  try {
    // #region connection-routing
    const shardOfRequest = new AsyncLocalStorage<string>();
    const shards: Record<string, Sequelize> = { b: shard };
    const manager = sequelize.connectionManager;
    const defaultGet = manager.getConnection.bind(manager);
    const defaultRelease = manager.releaseConnection.bind(manager);
    const owners = new WeakMap<object, Sequelize>();

    manager.getConnection = async (options) => {
      const target = shards[shardOfRequest.getStore() ?? ''];
      if (target === undefined) {
        return defaultGet(options);
      }
      const connection = await target.connectionManager.getConnection(options);
      owners.set(connection, target); // remember which pool the connection must go back to
      return connection;
    };
    manager.releaseConnection = (connection) => {
      const owner = owners.get(connection);
      return owner === undefined
        ? defaultRelease(connection)
        : owner.connectionManager.releaseConnection(connection);
    };

    const applicationName = async (): Promise<string> => {
      const rows = (await sequelize.query('SHOW application_name', {
        type: QueryTypes.SELECT,
      })) as { application_name: string }[];
      return rows[0]?.application_name ?? '';
    };
    routed = [
      await applicationName(), // no routing value: the instance's own pool
      await shardOfRequest.run('b', applicationName), // routed to the other instance's pool
      await shardOfRequest.run('b', () => sequelize.transaction(() => applicationName())),
    ];
    // routed: ['', 'shard-b', 'shard-b']
    // #endregion connection-routing
  } finally {
    await shard.close();
  }

  if (
    JSON.stringify(received) !== '["jobs: {\\"id\\":1}","jobs: export queued"]' ||
    JSON.stringify(user) !== '{"id":"42"}' ||
    busy ||
    !free ||
    order.join(',') !== 'first start,first end,second' ||
    routed.join(',') !== ',shard-b,shard-b'
  ) {
    throw new Error(
      `sessions example: unexpected result ${JSON.stringify([received, user, order, routed])}`,
    );
  }
};
