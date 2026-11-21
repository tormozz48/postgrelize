import { describe, it } from 'vitest';
import { expectSameError, expectSameResult } from '../support/compat.ts';

type Connection = { query: (text: string) => Promise<{ rows: Record<string, string>[] }> };

describe('afterConnect hook matches sequelize v6', () => {
  it('runs after beforeConnect with (connection, config) once per new connection', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const log: unknown[] = [];
      sequelize.addHook('beforeConnect', () => {
        log.push('beforeConnect');
      });
      sequelize.addHook('afterConnect', (connection: unknown, config: unknown) => {
        const settings = config as { database?: string; host?: string };
        log.push([
          'afterConnect',
          typeof (connection as Connection).query,
          typeof settings.database,
          typeof settings.host,
        ]);
      });
      await sequelize.query('SELECT 1');
      const afterFirst = log.length;
      await sequelize.query('SELECT 2');
      // v6 also connects once for its version probe, so only the last pair is comparable.
      return { reused: log.length === afterFirst, lastPair: log.slice(-2) };
    }));

  it('lets the hook run queries on the new connection', () =>
    expectSameResult('', async (_lib, sequelize) => {
      sequelize.addHook('afterConnect', async (connection: unknown) => {
        await (connection as Connection).query("SET idle_in_transaction_session_timeout = '12345'");
      });
      const [rows] = (await sequelize.query(
        "SELECT current_setting('idle_in_transaction_session_timeout') AS value",
      )) as unknown as [unknown[]];
      return rows;
    }));

  it('fails the query with the hook error', () =>
    expectSameError('', async (_lib, sequelize) => {
      sequelize.addHook('afterConnect', () => {
        throw new Error('hook failed');
      });
      await sequelize.query('SELECT 1');
    }));
});
