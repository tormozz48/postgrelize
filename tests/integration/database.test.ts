import { describe, expect, it } from 'vitest';
import { withSchema } from '../support/with-schema.ts';

describe('test database', () => {
  it('runs on PostgreSQL 16 or newer', async () => {
    const version = await withSchema(async ({ client }) => {
      const result = await client.query<{ server_version_num: string }>('SHOW server_version_num');
      return Number(result.rows[0]?.server_version_num);
    });
    expect(version).toBeGreaterThanOrEqual(160_000);
  });

  it('isolates each test in its own schema', async () => {
    const schema = await withSchema(async ({ client }) => {
      const result = await client.query<{ current_schema: string }>('SELECT current_schema()');
      return result.rows[0]?.current_schema;
    });
    expect(schema).toMatch(/^pgz_[0-9a-f]{12}$/);
  });
});
