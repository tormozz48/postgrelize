import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from '../../src/index.ts';
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

const urlFor = (database: string): string => {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${database}`;
  return url.toString();
};

const suffix = (): string => randomBytes(4).toString('hex');

type Fixture = Readonly<{
  main: Sequelize;
  shard: Sequelize;
  mainDb: string;
  shardDb: string;
  route: AsyncLocalStorage<string>;
  calls: { gets: number; releases: number };
  Item: ReturnType<Sequelize['define']>;
}>;

let fixture: Fixture;
const databases: string[] = [];
const instances: Sequelize[] = [];

const open = (database: string): Sequelize => {
  const sequelize = new Sequelize(urlFor(database), {
    logging: false,
    pool: { max: 1, acquire: 3000 },
  });
  instances.push(sequelize);
  return sequelize;
};

const define = (sequelize: Sequelize) =>
  sequelize.define('Item', { name: DataTypes.TEXT }, { timestamps: false });

const install = (main: Sequelize, shard: Sequelize) => {
  const route = new AsyncLocalStorage<string>();
  const calls = { gets: 0, releases: 0 };
  const manager = main.connectionManager;
  const defaultGet = manager.getConnection.bind(manager);
  const defaultRelease = manager.releaseConnection.bind(manager);
  const owners = new WeakMap<object, Sequelize>();
  manager.getConnection = async (options) => {
    calls.gets += 1;
    if (route.getStore() !== 'b') {
      return defaultGet(options);
    }
    const connection = await shard.connectionManager.getConnection(options);
    owners.set(connection, shard);
    return connection;
  };
  manager.releaseConnection = (connection: Connection) => {
    calls.releases += 1;
    const owner = owners.get(connection);
    return owner === undefined
      ? defaultRelease(connection)
      : owner.connectionManager.releaseConnection(connection);
  };
  return { route, calls };
};

beforeEach(async () => {
  const mainDb = `pgz_cm_a_${suffix()}`;
  const shardDb = `pgz_cm_b_${suffix()}`;
  databases.push(mainDb, shardDb);
  await admin(`CREATE DATABASE "${mainDb}"`);
  await admin(`CREATE DATABASE "${shardDb}"`);
  const main = open(mainDb);
  const shard = open(shardDb);
  define(shard);
  await shard.sync();
  const Item = define(main);
  await main.sync();
  fixture = { main, shard, mainDb, shardDb, Item, ...install(main, shard) };
});

afterEach(async () => {
  await Promise.all(instances.splice(0).map((sequelize) => sequelize.close()));
  await Promise.all(
    databases
      .splice(0)
      .map((database) => admin(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)),
  );
});

const currentDb = async (sequelize: Sequelize, options: object = {}): Promise<string> =>
  (
    (await sequelize.query('SELECT current_database() AS db', {
      type: QueryTypes.SELECT,
      ...options,
    })) as { db: string }[]
  )[0]?.db ?? '';

// Reads through a separate client so the one-connection pools under test are never contended.
const names = async (database: string): Promise<string[]> => {
  const client = new Client({ connectionString: urlFor(database) });
  await client.connect();
  try {
    const result = await client.query('SELECT name FROM "Items" ORDER BY name');
    return result.rows.map((row: { name: string }) => row.name);
  } finally {
    await client.end();
  }
};

const tables = async (sequelize: Sequelize): Promise<number> =>
  (
    (await sequelize.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'Others'`, {
      type: QueryTypes.SELECT,
    })) as unknown[]
  ).length;

const routed = <T>(run: () => Promise<T>): Promise<T> => fixture.route.run('b', run);

const expectPoolsFree = async (): Promise<void> => {
  // Both pools have max 1 and a short acquire timeout: a leaked or misrouted release would time out here.
  await expect(currentDb(fixture.main)).resolves.toBe(fixture.mainDb);
  await expect(currentDb(fixture.shard)).resolves.toBe(fixture.shardDb);
  expect(fixture.calls.releases).toBe(fixture.calls.gets);
};

describe('sequelize.connectionManager routing', () => {
  it('exposes getConnection and releaseConnection', async () => {
    const manager = fixture.main.connectionManager;
    const connection = await manager.getConnection({ type: 'write' });
    const result = await connection.query('SELECT current_database() AS db');
    await manager.releaseConnection(connection);
    expect(result.rows[0]).toEqual({ db: fixture.mainDb });
  });

  it('uses the default pool when no routing value is set', async () => {
    await fixture.Item.create({ name: 'a-row' });
    expect(await currentDb(fixture.main)).toBe(fixture.mainDb);
    expect(await names(fixture.mainDb)).toEqual(['a-row']);
    expect(await names(fixture.shardDb)).toEqual([]);
    await expectPoolsFree();
  });

  it('routes plain queries, finders and writes to the other database', async () => {
    await routed(async () => {
      expect(await currentDb(fixture.main)).toBe(fixture.shardDb);
      await fixture.Item.create({ name: 'b-row' });
      expect((await fixture.Item.findAll()).map((item) => item.get('name'))).toEqual(['b-row']);
    });
    expect(await names(fixture.shardDb)).toEqual(['b-row']);
    expect(await names(fixture.mainDb)).toEqual([]);
    await expectPoolsFree();
  });

  it('runs BEGIN, statements and COMMIT of a managed transaction on the routed connection', async () => {
    await routed(() =>
      fixture.main.transaction(async (transaction) => {
        // The pinned connection is used even when the routing value changes inside the callback.
        await fixture.route.run('a', async () => {
          expect(await currentDb(fixture.main, { transaction })).toBe(fixture.shardDb);
          await fixture.Item.create({ name: 'in-tx' }, { transaction });
        });
        expect(await names(fixture.shardDb)).toEqual([]);
      }),
    );
    expect(await names(fixture.shardDb)).toEqual(['in-tx']);
    expect(await names(fixture.mainDb)).toEqual([]);
    await expectPoolsFree();
  });

  it('rolls back on the routed connection and releases it to its own pool', async () => {
    await routed(async () => {
      const failure = new Error('abort');
      await expect(
        fixture.main.transaction(async (transaction) => {
          await fixture.Item.create({ name: 'rolled-back' }, { transaction });
          throw failure;
        }),
      ).rejects.toBe(failure);
    });
    expect(await names(fixture.shardDb)).toEqual([]);
    await expectPoolsFree();
  });

  it('streams findEach from the routed database', async () => {
    await fixture.shard.query(`INSERT INTO "Items" (name) VALUES ('x'), ('y'), ('z')`);
    const seen: string[] = [];
    await routed(async () => {
      for await (const item of fixture.Item.findEach(
        { order: [['name', 'ASC']] },
        { batchSize: 2 },
      )) {
        seen.push(String(item.get('name')));
      }
    });
    expect(seen).toEqual(['x', 'y', 'z']);
    await expectPoolsFree();
  });

  it('copies into the routed database', async () => {
    await routed(async () => {
      await fixture.Item.copyFrom([{ name: 'copied' }]);
    });
    expect(await names(fixture.shardDb)).toEqual(['copied']);
    expect(await names(fixture.mainDb)).toEqual([]);
    await expectPoolsFree();
  });

  it('copies out of the routed database', async () => {
    await fixture.shard.query(`INSERT INTO "Items" (name) VALUES ('out')`);
    const chunks: Buffer[] = [];
    await routed(async () => {
      for await (const chunk of fixture.Item.copyTo({ attributes: ['name'] })) {
        chunks.push(chunk);
      }
    });
    expect(Buffer.concat(chunks).toString()).toBe('out\n');
    await expectPoolsFree();
  });

  it('runs sync on the routed database', async () => {
    const Other = fixture.main.define('Other', { name: DataTypes.TEXT }, { timestamps: false });
    await routed(() => Other.sync());
    expect(await tables(fixture.shard)).toBe(1);
    expect(await tables(fixture.main)).toBe(0);
    await expectPoolsFree();
  });

  it('takes advisory locks on the routed connection', async () => {
    await routed(() =>
      fixture.main.transaction(async (transaction) => {
        await transaction.advisoryLock('cm-lock');
        expect(await transaction.tryAdvisoryLock('cm-lock')).toBe(true);
      }),
    );
    await expectPoolsFree();
  });

  it('does not mix concurrent requests with different routing values', async () => {
    const run = async (index: number): Promise<[number, string]> => {
      const database = await fixture.route.run(index % 2 === 0 ? 'b' : 'a', async () => {
        await fixture.main.transaction(async (transaction) => {
          await fixture.Item.create({ name: `r${index}` }, { transaction });
        });
        return currentDb(fixture.main);
      });
      return [index, database];
    };
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => run(index)));
    for (const [index, database] of results) {
      expect(database).toBe(index % 2 === 0 ? fixture.shardDb : fixture.mainDb);
    }
    expect(await names(fixture.shardDb)).toEqual(['r0', 'r10', 'r2', 'r4', 'r6', 'r8']);
    expect(await names(fixture.mainDb)).toEqual(['r1', 'r11', 'r3', 'r5', 'r7', 'r9']);
    await expectPoolsFree();
  });
});

describe('releasing a pooled connection twice', () => {
  it('is a no-op, so a wrapper that releases through both managers cannot corrupt a pool', async () => {
    const manager = fixture.shard.connectionManager;
    const connection = await manager.getConnection();
    await manager.releaseConnection(connection);
    await manager.releaseConnection(connection);
    await expect(currentDb(fixture.shard)).resolves.toBe(fixture.shardDb);
  });
});
