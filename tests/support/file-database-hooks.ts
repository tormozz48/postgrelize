import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, inject } from 'vitest';
import { useTestDatabaseUrl } from './db-url.ts';

const database = `pgz_file_${randomBytes(6).toString('hex')}`;

const admin = async (sql: string): Promise<void> => {
  const client = new Client({ connectionString: inject('databaseUrl') });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

/** Registers hooks that give the calling test file its own database. */
export const registerFileDatabase = (): void => {
  // Sequelize v6 reads indexes by table name in every schema, so v6 scenarios of parallel files
  // must not share a database: each compat file gets its own. Integration files that create an
  // extension need one too, because an extension exists once per database.
  beforeAll(async () => {
    await admin(`CREATE DATABASE "${database}"`);
    const url = new URL(inject('databaseUrl'));
    url.pathname = `/${database}`;
    useTestDatabaseUrl(url.toString());
  });

  afterAll(async () => {
    useTestDatabaseUrl(undefined);
    await admin(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  });
};
