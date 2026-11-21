import { afterEach, describe, expect, it } from 'vitest';
import { Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (applicationName: string, options: object = {}): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { application_name: applicationName },
    ...options,
  });
  opened.push(sequelize);
  return sequelize;
};

const backends = async (applicationName: string): Promise<number> => {
  const observer = connect('after-connect-observer');
  const [rows] = (await observer.query(
    'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = :name',
    { replacements: { name: applicationName } },
  )) as unknown as [{ n: number }[]];
  return rows[0]?.n ?? -1;
};

describe('afterConnect', () => {
  it('applies SET statements to every pooled connection', async () => {
    const sequelize = connect('after-connect-set', { pool: { max: 3 } });
    sequelize.addHook('afterConnect', async (connection: { query: (text: string) => unknown }) => {
      await connection.query("SET idle_in_transaction_session_timeout = '54321'");
    });
    const read = (): Promise<unknown> =>
      sequelize.query('SHOW idle_in_transaction_session_timeout');
    const results = await Promise.all([read(), read(), read()]);
    for (const result of results) {
      expect(JSON.stringify(result)).toContain('54321ms');
    }
  });

  it('rejects the query with the hook error and leaves no backend behind', async () => {
    const sequelize = connect('after-connect-failing');
    sequelize.addHook('afterConnect', () => {
      throw new TypeError('hook failed');
    });
    await expect(sequelize.query('SELECT 1')).rejects.toThrow(TypeError);
    await expect(sequelize.query('SELECT 1')).rejects.toThrow('hook failed');
    await expect.poll(() => backends('after-connect-failing'), { timeout: 30_000 }).toBe(0);
  });

  it('recovers once the hook stops failing', async () => {
    const sequelize = connect('after-connect-recover');
    let failing = true;
    sequelize.addHook('afterConnect', () => {
      if (failing) {
        throw new Error('not yet');
      }
    });
    await expect(sequelize.query('SELECT 1')).rejects.toThrow('not yet');
    failing = false;
    await expect(sequelize.query('SELECT 1')).resolves.toBeDefined();
  });
});
