import { Client } from 'pg';
import { testDatabaseUrl } from './db-url.ts';

export const setup = async (): Promise<void> => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `PostgreSQL is not reachable at ${testDatabaseUrl()}. Run "npm run db:up" or set PGZ_TEST_URL.`,
      { cause: error },
    );
  } finally {
    await client.end();
  }
};
