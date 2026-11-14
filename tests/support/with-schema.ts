import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { testDatabaseUrl } from './db-url.ts';

export type SchemaContext = Readonly<{ schema: string; client: Client }>;

const randomSchemaName = (): string => `pgz_${randomBytes(6).toString('hex')}`;

export const withSchema = async <T>(run: (ctx: SchemaContext) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  const schema = randomSchemaName();
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    return await run({ schema, client });
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
};
