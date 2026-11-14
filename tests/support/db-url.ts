export const testDatabaseUrl = (): string =>
  process.env['PGZ_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:54329/postgrelize';
