import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PAYLOADS,
  identifier,
  propertyParameters,
  settle,
  withCanary,
} from '../../support/injection.ts';

const syntaxError = (result: unknown): boolean =>
  (result as { original?: { code?: string } } | undefined)?.original?.code === '42601';

describe('catalog lookups and database commands keep inputs in their quoting', () => {
  it('binds table, schema and constraint names of showIndex and showConstraint', () =>
    withCanary(async ({ sequelize, schema }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        expect(await queryInterface.showIndex(payload)).toEqual([]);
        expect(await queryInterface.showIndex({ tableName: 'canary', schema: payload })).toEqual(
          [],
        );
        expect(await queryInterface.showConstraint(payload, payload)).toEqual([]);
        expect(
          await queryInterface.showConstraint({ tableName: 'canary', schema }, payload),
        ).toEqual([]);
      }
    }));

  it('quotes identifiers given to quoteIdentifier(s)', () =>
    withCanary(async ({ sequelize, client }) => {
      const queryInterface = sequelize.getQueryInterface();
      await fc.assert(
        fc.asyncProperty(identifier(), async (name) => {
          const quoted = queryInterface.quoteIdentifier(name);
          const result = await client.query(`SELECT 1 AS ${quoted}`);
          expect(result.fields[0]?.name).toBe(name);
        }),
        propertyParameters(),
      );
      for (const payload of PAYLOADS) {
        const result = await settle(
          Promise.resolve(client.query(`SELECT 1 AS ${queryInterface.quoteIdentifiers(payload)}`)),
        );
        expect(syntaxError(result)).toBe(false);
      }
    }));

  it('quotes database names and escapes createDatabase options', () =>
    withCanary(async ({ sequelize, client }) => {
      const queryInterface = sequelize.getQueryInterface();
      await fc.assert(
        fc.asyncProperty(identifier(), async (name) => {
          const database = `pgz_${name}`.slice(0, 60);
          await queryInterface.createDatabase(database);
          const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
            database,
          ]);
          expect(found.rowCount).toBe(1);
          await queryInterface.dropDatabase(database);
        }),
        { ...propertyParameters(), numRuns: 5 },
      );
      for (const payload of PAYLOADS) {
        await queryInterface.dropDatabase(payload);
        for (const option of ['encoding', 'collate', 'ctype', 'template'] as const) {
          const result = await settle(
            queryInterface.createDatabase('pgz_never', { [option]: payload }),
          );
          expect(syntaxError(result)).toBe(false);
        }
      }
      const created = await client.query("SELECT 1 FROM pg_database WHERE datname = 'pgz_never'");
      expect(created.rowCount).toBe(0);
    }));
});

describe('Deferrable.SET_DEFERRED keeps constraint names in their quoting', () => {
  it('quotes the names given to SET_DEFERRED / SET_IMMEDIATE', () =>
    withCanary(async ({ sequelize, client }) => {
      const { Deferrable } = await import('../../../src/index.ts');
      for (const payload of PAYLOADS) {
        for (const mode of [Deferrable.SET_DEFERRED, Deferrable.SET_IMMEDIATE]) {
          const result = await settle(
            sequelize.transaction({ deferrable: mode([payload]) }, async () => undefined),
          );
          expect(syntaxError(result), `payload ${payload}`).toBe(false);
        }
      }
      const pwned = await client.query("SELECT 1 FROM pg_class WHERE relname = 'pwned'");
      expect(pwned.rowCount).toBe(0);
    }));

  it('rejects a deferrable value that was not made by Deferrable', () =>
    withCanary(async ({ sequelize }) => {
      const result = await settle(
        sequelize.transaction({ deferrable: { sql: 'SELECT 1' } as never }, async () => undefined),
      );
      expect(result).toBeInstanceOf(Error);
    }));
});
