import { createServer } from 'node:net';
import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

type Manager = { getConnection: (options?: unknown) => Promise<unknown> };

// An instance pointed at a closed port: every attempt is refused, so the number of
// getConnection calls is the number of attempts.
const attempts = async (lib: Lib, retry: object, query: object = {}) => {
  const url = new URL(testDatabaseUrl());
  const port = await freePort();
  const sequelize = new lib.Sequelize(
    `postgres://${url.username}:${url.password}@127.0.0.1:${port}/x`,
    {
      logging: false,
      ...(Object.keys(retry).length > 0 ? { retry } : {}),
    },
  );
  let count = 0;
  const manager = (sequelize as unknown as { connectionManager: Manager }).connectionManager;
  const get = manager.getConnection.bind(manager);
  manager.getConnection = (options) => {
    count += 1;
    return get(options);
  };
  try {
    await sequelize.query('SELECT 1', query);
    return { count, failure: undefined };
  } catch (error) {
    return { count, failure: (error as Error).name };
  } finally {
    await sequelize.close();
  }
};

describe('retry option matches sequelize v6', () => {
  it('does not retry by default', () => expectSameResult('', (lib) => attempts(lib, {})));

  it('retries a matching connection error up to max attempts', () =>
    expectSameResult('', (lib) =>
      attempts(lib, { max: 3, match: [/SequelizeConnectionRefusedError/], backoffBase: 1 }),
    ));

  it('does not retry an error that does not match', () =>
    expectSameResult('', (lib) =>
      attempts(lib, { max: 3, match: [/SequelizeHostNotFoundError/], backoffBase: 1 }),
    ));

  it('matches a message string and an error-name regular expression', () =>
    expectSameResult('', async (lib) => [
      await attempts(lib, { max: 2, match: ['ECONNREFUSED'], backoffBase: 1 }),
      await attempts(lib, { max: 2, match: [/ECONNREFUSED/], backoffBase: 1 }),
      await attempts(lib, { max: 2, match: ['SequelizeConnectionRefusedError'], backoffBase: 1 }),
    ]));

  it('merges the per-query retry option over the instance option', () =>
    expectSameResult('', async (lib) => [
      await attempts(lib, {}, { retry: { max: 2, match: [/ConnectionRefused/], backoffBase: 1 } }),
      await attempts(
        lib,
        { max: 5, match: [/ConnectionRefused/], backoffBase: 1 },
        { retry: { max: 2 } },
      ),
    ]));

  it('does not retry without max', () =>
    expectSameResult('', (lib) =>
      attempts(lib, { match: [/SequelizeConnectionRefusedError/], backoffBase: 1 }),
    ));
});
