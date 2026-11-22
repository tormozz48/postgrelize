import { connect, createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConnectionRefusedError,
  DataTypes,
  DatabaseError,
  QueryTypes,
  Sequelize,
  type RetryOptions,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

const servers: Server[] = [];
const sockets = new Set<Socket>();
const instances: Sequelize[] = [];

afterEach(async () => {
  await Promise.all(instances.splice(0).map((sequelize) => sequelize.close()));
  for (const socket of sockets) {
    socket.destroy();
  }
  sockets.clear();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

// Forwards connections to the real PostgreSQL server.
const startProxy = (port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const target = new URL(testDatabaseUrl());
    const server = createServer((client) => {
      const upstream = connect(Number(target.port), target.hostname);
      sockets.add(client).add(upstream);
      client.pipe(upstream).pipe(client);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
    servers.push(server);
  });

type Flaky = Readonly<{ sequelize: Sequelize; attempts: () => number }>;

// A Sequelize instance whose first `refusals` connection attempts hit a closed port (ECONNREFUSED);
// the proxy to the real server starts right before the next attempt.
const flaky = async (refusals: number, options: object = {}): Promise<Flaky> => {
  const url = new URL(testDatabaseUrl());
  const port = await freePort();
  const sequelize = new Sequelize(
    `postgres://${url.username}:${url.password}@127.0.0.1:${port}${url.pathname}`,
    { logging: false, ...options },
  );
  instances.push(sequelize);
  let attempts = 0;
  const manager = sequelize.connectionManager;
  const get = manager.getConnection.bind(manager);
  manager.getConnection = async (acquire) => {
    attempts += 1;
    if (attempts === refusals + 1) {
      await startProxy(port);
    }
    return get(acquire);
  };
  return { sequelize, attempts: () => attempts };
};

const RETRY: RetryOptions = { max: 5, match: [/SequelizeConnectionRefusedError/], backoffBase: 1 };

describe('retry option', () => {
  it('retries connection errors until a connection is made', async () => {
    const { sequelize, attempts } = await flaky(2, { retry: RETRY });
    const rows = await sequelize.query('SELECT 1 AS one', { type: QueryTypes.SELECT });
    expect(rows).toEqual([{ one: 1 }]);
    expect(attempts()).toBe(3);
  });

  it('does not retry without the option', async () => {
    const { sequelize, attempts } = await flaky(2);
    await expect(sequelize.query('SELECT 1')).rejects.toBeInstanceOf(ConnectionRefusedError);
    expect(attempts()).toBe(1);
  });

  it('does not retry an error the match list does not name', async () => {
    const { sequelize, attempts } = await flaky(2, {
      retry: { max: 5, match: [/SequelizeHostNotFoundError/], backoffBase: 1 },
    });
    await expect(sequelize.query('SELECT 1')).rejects.toMatchObject({
      name: 'SequelizeConnectionRefusedError',
    });
    expect(attempts()).toBe(1);
  });

  it('stops after max attempts and throws the last error', async () => {
    const { sequelize, attempts } = await flaky(10, {
      retry: { max: 3, match: [/SequelizeConnectionRefusedError/], backoffBase: 1 },
    });
    await expect(sequelize.query('SELECT 1')).rejects.toBeInstanceOf(ConnectionRefusedError);
    expect(attempts()).toBe(3);
  });

  it('takes the retry option of a single query', async () => {
    const { sequelize, attempts } = await flaky(2);
    await expect(sequelize.query('SELECT 1', { retry: RETRY })).resolves.toBeDefined();
    expect(attempts()).toBe(3);
  });

  it('merges the per-query option over the instance option', async () => {
    const { sequelize, attempts } = await flaky(10, { retry: RETRY });
    await expect(sequelize.query('SELECT 1', { retry: { max: 2 } })).rejects.toBeInstanceOf(
      ConnectionRefusedError,
    );
    expect(attempts()).toBe(2);
  });

  it('covers finders and writes', async () => {
    const { sequelize, attempts } = await flaky(1, { retry: RETRY });
    const Note = sequelize.define('RetryNote', { body: DataTypes.TEXT }, { timestamps: false });
    await Note.sync({ force: true });
    expect(attempts()).toBeGreaterThanOrEqual(2);
    await Note.create({ body: 'a' });
    expect(await Note.findAll({ retry: { max: 2 } })).toHaveLength(1);
    await Note.drop();
  });

  it('retries acquiring the connection and BEGIN of a transaction, running the callback once', async () => {
    const { sequelize, attempts } = await flaky(2, { retry: RETRY });
    let runs = 0;
    const result = await sequelize.transaction(async (transaction) => {
      runs += 1;
      return sequelize.query('SELECT 7 AS seven', { type: QueryTypes.SELECT, transaction });
    });
    expect(result).toEqual([{ seven: 7 }]);
    expect(runs).toBe(1);
    expect(attempts()).toBe(3);
  });

  it('takes the retry option of an unmanaged transaction', async () => {
    const { sequelize, attempts } = await flaky(1);
    const transaction = await sequelize.transaction({ retry: RETRY });
    await transaction.commit();
    expect(attempts()).toBe(2);
  });

  it('retries a failing statement outside a transaction but never inside one', async () => {
    const { sequelize, attempts } = await flaky(0);
    const retry: RetryOptions = { max: 3, backoffBase: 1 };

    await expect(sequelize.query('SELECT 1/0', { retry })).rejects.toBeInstanceOf(DatabaseError);
    expect(attempts()).toBe(3);

    const before = attempts();
    await expect(
      sequelize.transaction((transaction) => sequelize.query('SELECT 1/0', { retry, transaction })),
    ).rejects.toBeInstanceOf(DatabaseError);
    expect(attempts() - before).toBe(1);
  });
});
