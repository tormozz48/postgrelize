import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Client = { emit(name: string, error: object): void; end(): Promise<void> | void };
type Manager = {
  getConnection(): Promise<Client>;
  releaseConnection(client: Client): unknown;
  validate(client: Client): unknown;
};

const wait = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('compat: dead pooled connections', () => {
  it('are replaced', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const manager = (sequelize as unknown as { connectionManager: Manager }).connectionManager;
      const first = await manager.getConnection();
      first.emit('error', { code: 'ECONNRESET' });
      const second = await manager.getConnection();
      const results = [second !== first, Boolean(manager.validate(first))];
      await manager.releaseConnection(second);
      await second.end();
      await wait();
      const third = await manager.getConnection();
      results.push(third !== second, Boolean(manager.validate(second)));
      await manager.releaseConnection(third);
      const [rows] = await sequelize.query('SELECT 1 AS one');
      return [results, rows];
    }));
});
