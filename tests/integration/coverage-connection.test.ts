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
});
