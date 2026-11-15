import * as fc from 'fast-check';
import { expect } from 'vitest';
import { Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from './db-url.ts';
import { withSchema, type SchemaContext } from './with-schema.ts';

const breakouts = [
  "'",
  '"',
  '\\',
  "\\'",
  "''",
  '$$',
  '$x$',
  ')',
  "')",
  '")',
  '*/',
  ']',
  '}',
] as const;

const tails = [
  '; CREATE TABLE pwned (); --',
  ' OR 1=1 --',
  '; DROP TABLE canary; --',
  ' /* ',
  '; SELECT pg_sleep(0); --',
] as const;

/** Classic payloads: every quoting context breakout followed by an injected statement, plus encodings. */
export const PAYLOADS: readonly string[] = [
  ...breakouts.flatMap((breakout) => tails.map((tail) => `x${breakout}${tail}`)),
  "E'\\x27; CREATE TABLE pwned (); --",
  "U&'\\0027; CREATE TABLE pwned (); --",
  '$tag$; CREATE TABLE pwned (); $tag$',
  '’; CREATE TABLE pwned (); --',
  '%; CREATE TABLE pwned (); --',
  ':name; CREATE TABLE pwned (); --',
  '?; CREATE TABLE pwned (); --',
  '$1; CREATE TABLE pwned (); --',
  'a'.repeat(10_000),
];

/** Strings PostgreSQL can store in text (no NUL byte), including every Unicode plane. */
export const textValue = (): fc.Arbitrary<string> =>
  fc
    .oneof(
      fc.string({ unit: 'binary', maxLength: 40 }),
      fc.constantFrom(...PAYLOADS),
      fc.string({
        unit: fc.constantFrom("'", '"', '\\', '$', ';', '-', '/', '*', ':', '?', 'a', ' '),
      }),
    )
    .map((value) => value.replaceAll('\0', ''));

/** Strings usable as PostgreSQL identifiers: 1..63 bytes, no NUL byte. */
export const identifier = (): fc.Arbitrary<string> =>
  textValue()
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && Buffer.byteLength(value) <= 63);

/** Property runs: fixed seed so CI failures reproduce; override with PGZ_FC_SEED / PGZ_FC_RUNS. */
export const propertyParameters = (): fc.Parameters<unknown> => ({
  seed: Number(process.env['PGZ_FC_SEED'] ?? 20_261_115),
  numRuns: Number(process.env['PGZ_FC_RUNS'] ?? 60),
});

export type CanaryContext = SchemaContext & Readonly<{ sequelize: Sequelize }>;

/**
 * Runs `run` in a fresh schema next to a canary table, then asserts that no injected statement
 * took effect: the canary keeps its row and no `pwned` table exists anywhere.
 */
export const withCanary = <T>(run: (ctx: CanaryContext) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query('CREATE TABLE canary (id integer); INSERT INTO canary VALUES (1)');
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    try {
      return await run({ schema, client, sequelize });
    } finally {
      await sequelize.close();
      const canary = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM "${schema}".canary`,
      );
      expect(canary.rows[0]?.count, 'canary table lost its row').toBe('1');
      const pwned = await client.query("SELECT 1 FROM pg_class WHERE relname = 'pwned'");
      expect(pwned.rowCount, 'an injected CREATE TABLE ran').toBe(0);
    }
  });

/** Like `withCanary`, but an error from `run` (e.g. a rejected identifier) is returned, not thrown. */
export const settle = async <T>(promise: Promise<T>): Promise<T | Error> => {
  try {
    return await promise;
  } catch (error) {
    return error as Error;
  }
};
