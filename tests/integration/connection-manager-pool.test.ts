import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

type Connection = Awaited<ReturnType<Sequelize['connectionManager']['getConnection']>>;

const admin = async (sql: string): Promise<void> => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

const databases: string[] = [];
const instances: Sequelize[] = [];
let primaryDb = '';
let replicaDb = '';
let sequelize: Sequelize;

const member = (database: string) => {
  const url = new URL(testDatabaseUrl());
  return {
    host: url.hostname,
    port: Number(url.port),
    database,
    username: url.username,
    password: url.password,
  };
};

const open = (replication: boolean, max: number): Sequelize => {
  const instance = new Sequelize(testDatabaseUrl(), {
    logging: false,
    pool: { max, acquire: 3000 },
    ...(replication
      ? { replication: { read: [member(replicaDb)], write: member(primaryDb) } }
      : {}),
  });
  instances.push(instance);
  return instance;
};

beforeEach(async () => {
  const suffix = randomBytes(4).toString('hex');
  primaryDb = `pgz_pool_p_${suffix}`;
  replicaDb = `pgz_pool_r_${suffix}`;
  databases.push(primaryDb, replicaDb);
  await admin(`CREATE DATABASE "${primaryDb}"`);
  await admin(`CREATE DATABASE "${replicaDb}"`);
});

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.close()));
  await Promise.all(
    databases
      .splice(0)
      .map((database) => admin(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)),
  );
});

const info = async (connection: Connection): Promise<{ db: string; pid: number }> => {
  const result = await connection.query('SELECT current_database() AS db, pg_backend_pid() AS pid');
  return result.rows[0] as { db: string; pid: number };
};

const counts = (counters: { size: number; available: number; using: number; waiting: number }) => ({
  size: counters.size,
  available: counters.available,
  using: counters.using,
  waiting: counters.waiting,
});

const idle = { size: 0, available: 0, using: 0, waiting: 0 };

describe('connectionManager read / write routing', () => {
  beforeEach(() => {
    sequelize = open(true, 3);
  });

  it('gives a replica connection for type read and a primary one otherwise', async () => {
    const manager = sequelize.connectionManager;
    const held: Connection[] = [];
    const dbOf = async (options?: Parameters<typeof manager.getConnection>[0]) => {
      const connection = await manager.getConnection(options);
      held.push(connection);
      return (await info(connection)).db;
    };
    expect(await dbOf({ type: 'read' })).toBe(replicaDb);
    expect(await dbOf({ type: 'SELECT' })).toBe(replicaDb);
    expect(await dbOf({ type: 'write' })).toBe(primaryDb);
    expect(await dbOf()).toBe(primaryDb);
    expect(await dbOf({ type: 'read', useMaster: true })).toBe(primaryDb);
    await Promise.all(held.map((connection) => manager.releaseConnection(connection)));
  });

  it('serves SELECT queries from the replica and other statements from the primary', async () => {
    const dbOfQuery = async (type: QueryTypes): Promise<string> =>
      ((await sequelize.query('SELECT current_database() AS db', { type })) as { db: string }[])[0]
        ?.db ?? '';
    expect(await dbOfQuery(QueryTypes.SELECT)).toBe(replicaDb);
    const [rows] = (await sequelize.query('SELECT current_database() AS db')) as [
      { db: string }[],
      unknown,
    ];
    expect(rows[0]?.db).toBe(primaryDb);
  });
});

describe('connectionManager.pool counters', () => {
  it('are all zero and readable before the first connection', () => {
    sequelize = open(false, 3);
    const { pool } = sequelize.connectionManager;
    expect(counts(pool)).toEqual(idle);
    expect(pool.maxSize).toBe(3);
    expect(pool.read).toBeUndefined();
    expect(pool.write).toBeUndefined();
  });

  it('follow acquire and release', async () => {
    sequelize = open(false, 3);
    const manager = sequelize.connectionManager;
    const { pool } = manager;
    const first = await manager.getConnection();
    const second = await manager.getConnection();
    expect(counts(pool)).toEqual({ size: 2, available: 0, using: 2, waiting: 0 });
    await manager.releaseConnection(first);
    expect(counts(pool)).toEqual({ size: 2, available: 1, using: 1, waiting: 0 });
    await manager.releaseConnection(second);
    expect(counts(pool)).toEqual({ size: 2, available: 2, using: 0, waiting: 0 });
    expect(pool.maxSize).toBe(3);
  });

  it('count a pending acquisition as waiting until a connection is free', async () => {
    sequelize = open(false, 1);
    const manager = sequelize.connectionManager;
    const held = await manager.getConnection();
    const pending = manager.getConnection();
    expect(manager.pool.waiting).toBe(1);
    await manager.releaseConnection(held);
    const next = await pending;
    expect(counts(manager.pool)).toEqual({ size: 1, available: 0, using: 1, waiting: 0 });
    await manager.releaseConnection(next);
    expect(counts(manager.pool)).toEqual({ size: 1, available: 1, using: 0, waiting: 0 });
  });

  it('are summed over writer and replicas with a read / write split', async () => {
    sequelize = open(true, 2);
    const manager = sequelize.connectionManager;
    const { pool } = manager;
    expect(counts(pool)).toEqual(idle);
    expect(pool.maxSize).toBe(4);
    expect(pool.read?.maxSize).toBe(2);
    expect(pool.write?.maxSize).toBe(2);
    const reader = await manager.getConnection({ type: 'read' });
    expect(counts(pool.read!)).toEqual({ size: 1, available: 0, using: 1, waiting: 0 });
    expect(counts(pool.write!)).toEqual(idle);
    expect(counts(pool)).toEqual({ size: 1, available: 0, using: 1, waiting: 0 });
    await manager.releaseConnection(reader);
  });
});

describe('connectionManager.releaseConnection', () => {
  beforeEach(() => {
    sequelize = open(true, 1);
  });

  it('returns a read connection to the replica pool, not to the primary pool', async () => {
    const manager = sequelize.connectionManager;
    const { read, write } = manager.pool;
    const reader = await manager.getConnection({ type: 'read' });
    await manager.releaseConnection(reader);
    expect(counts(read!)).toEqual({ size: 1, available: 1, using: 0, waiting: 0 });
    expect(counts(write!)).toEqual(idle);
    const again = await manager.getConnection({ type: 'read' });
    expect((await info(again)).pid).toBe((await info(reader)).pid);
    await manager.releaseConnection(again);
  });

  it('releases a connection acquired after the caller stopped waiting, without side effects', async () => {
    const manager = sequelize.connectionManager;
    const holder = await manager.getConnection({ type: 'read' });
    // The only replica connection is held, so this acquisition stays pending: the caller that
    // wanted it has moved on (timed out) and will never look at the result.
    const late = manager.getConnection({ type: 'read' });
    expect(manager.pool.read?.waiting).toBe(1);
    await manager.releaseConnection(holder);
    const lateConnection = await late;
    await manager.releaseConnection(lateConnection);
    await manager.releaseConnection(lateConnection);
    expect(counts(manager.pool.read!)).toEqual({ size: 1, available: 1, using: 0, waiting: 0 });
    expect(counts(manager.pool.write!)).toEqual(idle);
  });
});

describe('connectionManager.destroyConnection', () => {
  beforeEach(() => {
    sequelize = open(true, 1);
  });

  it('removes the connection from its pool and opens a replacement on demand', async () => {
    const manager = sequelize.connectionManager;
    const { read, write } = manager.pool;
    const broken = await manager.getConnection({ type: 'read' });
    const brokenPid = (await info(broken)).pid;
    await manager.destroyConnection(broken);
    expect(counts(read!)).toEqual(idle);
    const fresh = await manager.getConnection({ type: 'read' });
    const after = await info(fresh);
    expect(after.pid).not.toBe(brokenPid);
    expect(after.db).toBe(replicaDb);
    expect(counts(read!)).toEqual({ size: 1, available: 0, using: 1, waiting: 0 });
    await manager.releaseConnection(broken);
    expect(counts(read!)).toEqual({ size: 1, available: 0, using: 1, waiting: 0 });
    await manager.releaseConnection(fresh);
    expect(counts(read!)).toEqual({ size: 1, available: 1, using: 0, waiting: 0 });
    expect(counts(write!)).toEqual(idle);
  });

  it('lets a waiting acquisition continue on a new connection', async () => {
    const manager = sequelize.connectionManager;
    const broken = await manager.getConnection();
    const brokenPid = (await info(broken)).pid;
    const waiter = manager.getConnection();
    expect(manager.pool.write?.waiting).toBe(1);
    await manager.destroyConnection(broken);
    const replacement = await waiter;
    expect((await info(replacement)).pid).not.toBe(brokenPid);
    await manager.releaseConnection(replacement);
    expect(counts(manager.pool.write!)).toEqual({ size: 1, available: 1, using: 0, waiting: 0 });
  });
});
