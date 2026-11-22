import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const SETUP = `CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL);`;

type Manager = {
  getConnection: (options?: unknown) => Promise<unknown>;
  releaseConnection: (connection: unknown) => unknown;
  destroyConnection: (connection: unknown) => Promise<void>;
  pool: Record<'size' | 'available' | 'using' | 'waiting' | 'maxSize', number>;
};

const counters = (manager: Manager): Manager['pool'] => {
  const { size, available, using, waiting, maxSize } = manager.pool;
  return { size, available, using, waiting, maxSize };
};

const recordCalls = (sequelize: unknown): string[] => {
  const calls: string[] = [];
  const manager = (sequelize as { connectionManager: Manager }).connectionManager;
  const get = manager.getConnection.bind(manager);
  const release = manager.releaseConnection.bind(manager);
  manager.getConnection = async (options) => {
    calls.push('get');
    return get(options);
  };
  manager.releaseConnection = (connection) => {
    calls.push('release');
    return release(connection);
  };
  return calls;
};

describe('sequelize.connectionManager matches sequelize v6', () => {
  it('goes through the replaced getConnection / releaseConnection for a query', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const calls = recordCalls(sequelize);
      const User = sequelize.define(
        'User',
        { name: lib.DataTypes.STRING },
        { timestamps: false, tableName: 'users' },
      );
      await User.create({ name: 'ann' });
      await sequelize.query('SELECT 1');
      return { calls, count: await User.count() };
    }));

  it('pins one connection for a transaction and releases it at the end', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const User = sequelize.define(
        'User',
        { name: lib.DataTypes.STRING },
        { timestamps: false, tableName: 'users' },
      );
      const calls = recordCalls(sequelize);
      await sequelize.transaction(async (transaction) => {
        calls.push('begun');
        await User.create({ name: 'ann' }, { transaction });
        calls.push('written');
      });
      return calls;
    }));

  it('exposes both methods as functions', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const manager = (sequelize as unknown as { connectionManager: Manager }).connectionManager;
      return [typeof manager.getConnection, typeof manager.releaseConnection];
    }));

  it('exposes destroyConnection as a function', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const manager = (sequelize as unknown as { connectionManager: Manager }).connectionManager;
      return typeof manager.destroyConnection;
    }));

  it('reports the same pool counters before, during and after use', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const manager = (sequelize as unknown as { connectionManager: Manager }).connectionManager;
      const seen = [counters(manager)];
      const first = await manager.getConnection({ type: 'write' });
      const second = await manager.getConnection({ type: 'write' });
      seen.push(counters(manager));
      manager.releaseConnection(first);
      seen.push(counters(manager));
      await manager.destroyConnection(second);
      seen.push(counters(manager));
      return seen;
    }));
});
