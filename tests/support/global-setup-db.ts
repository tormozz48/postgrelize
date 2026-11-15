import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const serverUrl = (): string =>
  process.env['PGZ_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:54329/postgrelize';

const admin = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: serverUrl() });
  try {
    await client.connect();
    return await run(client);
  } finally {
    await client.end();
  }
};

// Every project of every run gets its own database: advisory locks, LISTEN channels and
// type names are database-wide, so parallel projects and concurrent runs never collide.
export const setup = async (project: TestProject): Promise<() => Promise<void>> => {
  const database = `pgz_run_${randomBytes(6).toString('hex')}`;
  try {
    await admin((client) => client.query(`CREATE DATABASE "${database}"`));
  } catch (error) {
    throw new Error(
      `PostgreSQL is not reachable at ${serverUrl()}. Run "npm run db:up" or set PGZ_TEST_URL.`,
      { cause: error },
    );
  }
  const url = new URL(serverUrl());
  url.pathname = `/${database}`;
  project.provide('databaseUrl', url.toString());
  return async () => {
    await admin((client) => client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`));
  };
};
