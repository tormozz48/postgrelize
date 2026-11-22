import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const admin = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const withReaderRole = async <T>(run: (role: string) => Promise<T>): Promise<T> => {
  const role = `pgz_reader_${randomBytes(4).toString('hex')}`;
  await admin((client) => client.query(`CREATE ROLE "${role}" LOGIN PASSWORD 'reader'`));
  try {
    return await run(role);
  } finally {
    await admin((client) => client.query(`DROP ROLE IF EXISTS "${role}"`));
  }
};

const setup = async (schema: string, role: string) => {
  const url = new URL(testDatabaseUrl());
  const member = {
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.slice(1),
  };
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
    replication: {
      read: [
        { ...member, username: role, password: 'reader' },
        { ...member, username: role, password: 'reader' },
      ],
      write: { ...member, username: url.username, password: url.password },
    },
  });
  opened.push(sequelize);
  const Item = sequelize.define('Item', {
    name: DataTypes.TEXT,
    owner: { type: DataTypes.TEXT, defaultValue: sequelize.literal('current_user') },
  });
  await sequelize.sync();
  await sequelize.query(
    `GRANT USAGE ON SCHEMA "${schema}" TO "${role}"; GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`,
  );
  return { sequelize, Item, writer: url.username };
};

const whoAmI = async (sequelize: Sequelize, options: object = {}) =>
  (
    (await sequelize.query('SELECT current_user AS who', {
      type: QueryTypes.SELECT,
      ...options,
    })) as { who: string }[]
  )[0]?.who;

describe('read replicas', () => {
  it('routes reads to readers and writes to the writer', () =>
    withReaderRole((role) =>
      withSchema(async ({ schema }) => {
        const { sequelize, Item, writer } = await setup(schema, role);
        const created = await Item.create({ name: 'a' });
        expect(created.get('owner')).toBe(writer);
        expect(await whoAmI(sequelize)).toBe(role);
        expect(await Item.count()).toBe(1);
        const [found] = await Item.findAll({
          attributes: ['name', [sequelize.literal('current_user'), 'who']],
          raw: true,
        });
        expect(found).toEqual({ name: 'a', who: role });
        await expect(
          sequelize.query(
            `INSERT INTO "Items" (name, "createdAt", "updatedAt") VALUES ('x', now(), now())`,
          ),
        ).resolves.toBeDefined();
      }),
    ));

  it('uses the writer for useMaster and inside transactions', () =>
    withReaderRole((role) =>
      withSchema(async ({ schema }) => {
        const { sequelize, writer } = await setup(schema, role);
        expect(await whoAmI(sequelize, { useMaster: true })).toBe(writer);
        const inTransaction = await sequelize.transaction((transaction) =>
          whoAmI(sequelize, { transaction }),
        );
        expect(inTransaction).toBe(writer);
      }),
    ));

  it('selects replicas through connectionManager.getConnection', () =>
    withReaderRole((role) =>
      withSchema(async ({ schema }) => {
        const { sequelize, writer } = await setup(schema, role);
        const manager = sequelize.connectionManager;
        const user = async (options?: { type?: 'read' | 'write'; useMaster?: boolean }) => {
          const connection = await manager.getConnection(options);
          try {
            return (await connection.query('SELECT current_user AS who')).rows[0]?.who;
          } finally {
            await manager.releaseConnection(connection);
          }
        };
        expect(await user()).toBe(writer);
        expect(await user({ type: 'write' })).toBe(writer);
        expect(await user({ type: 'read' })).toBe(role);
        expect(await user({ type: 'read', useMaster: true })).toBe(writer);
      }),
    ));

  it('round-robins between readers', () =>
    withReaderRole((role) =>
      withSchema(async ({ schema }) => {
        const { sequelize } = await setup(schema, role);
        const pid = async () =>
          (
            (await sequelize.query('SELECT pg_backend_pid() AS pid', {
              type: QueryTypes.SELECT,
            })) as { pid: number }[]
          )[0]?.pid;
        const pids = [await pid(), await pid(), await pid(), await pid()];
        expect(pids[0]).toBe(pids[2]);
        expect(pids[1]).toBe(pids[3]);
        expect(new Set(pids).size).toBeGreaterThan(1);
      }),
    ));

  it('sends finds with a data-modifying CTE to the writer', () =>
    withReaderRole((role) =>
      withSchema(async ({ schema }) => {
        const { sequelize, Item } = await setup(schema, role);
        await Item.create({ name: 'a' });
        const removed = await Item.findAll({
          with: { gone: Item.deleteStatement({ where: { name: 'a' }, returning: true }) },
          source: 'gone',
        });
        expect(removed.map((row) => row.get('name'))).toEqual(['a']);
        expect(await Item.count({ useMaster: true })).toBe(0);
        expect(await sequelize.query('SELECT 1')).toBeDefined();
      }),
    ));
});
