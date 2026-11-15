import { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionError, ConnectionRefusedError, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

describe('connection failures', () => {
  it('maps a refused dedicated LISTEN connection to a connection error', async () => {
    const sequelize = new Sequelize('postgres://u:p@127.0.0.1:1/db', { logging: false });
    opened.push(sequelize);
    const failure = await sequelize
      .listen('events', () => undefined)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConnectionRefusedError);
    expect(failure).toBeInstanceOf(ConnectionError);
  });

  it('drops an idle pooled connection killed by the server and keeps serving queries', () =>
    withSchema(async ({ schema }) => {
      const sequelize = new Sequelize(testDatabaseUrl(), {
        logging: false,
        pool: { max: 1 },
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      opened.push(sequelize);
      const [first] = (await sequelize.query('SELECT pg_backend_pid() AS pid', {
        type: 'SELECT',
      })) as { pid: number }[];
      const pid = first?.pid;
      const killer = new Client({ connectionString: testDatabaseUrl() });
      await killer.connect();
      try {
        await killer.query('SELECT pg_terminate_backend($1)', [pid]);
        await vi.waitFor(async () => {
          const alive = await killer.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid]);
          expect(alive.rowCount).toBe(0);
        });
        await vi.waitFor(async () => {
          const [next] = (await sequelize.query('SELECT pg_backend_pid() AS pid', {
            type: 'SELECT',
          })) as { pid: number }[];
          expect(next?.pid).not.toBe(pid);
        });
      } finally {
        await killer.end();
      }
    }));

  it('rejects the in-flight work and keeps the pool usable when a checked-out backend is killed', () =>
    withSchema(async ({ schema }) => {
      const uncaught: unknown[] = [];
      const onUncaught = (error: unknown): void => void uncaught.push(error);
      process.on('uncaughtException', onUncaught);
      const sequelize = new Sequelize(testDatabaseUrl(), {
        logging: false,
        pool: { max: 1 },
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      opened.push(sequelize);
      const killer = new Client({ connectionString: testDatabaseUrl() });
      await killer.connect();
      try {
        const transaction = await sequelize.transaction();
        const [first] = (await sequelize.query('SELECT pg_backend_pid() AS pid', {
          type: 'SELECT',
          transaction,
        })) as { pid: number }[];
        await killer.query('SELECT pg_terminate_backend($1)', [first?.pid]);
        await expect(sequelize.query('SELECT 1', { transaction })).rejects.toBeInstanceOf(Error);
        await transaction.rollback().catch(() => undefined);
        const [next] = (await sequelize.query('SELECT pg_backend_pid() AS pid', {
          type: 'SELECT',
        })) as { pid: number }[];
        expect(next?.pid).not.toBe(first?.pid);
        expect(uncaught).toEqual([]);
      } finally {
        process.off('uncaughtException', onUncaught);
        await killer.end();
      }
    }));
});
