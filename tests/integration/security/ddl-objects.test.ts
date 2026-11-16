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

const names = async (client: { query: Function }, schema: string): Promise<string[]> =>
  (
    (await client.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'S'",
      [schema],
    )) as { rows: { relname: string }[] }
  ).rows.map((row) => row.relname);

describe('DDL object names and keywords cannot break out of their quoting', () => {
  it('quotes sequence names, owners and bound sequence calls', () =>
    withCanary(async ({ sequelize, client, schema }) => {
      const queryInterface = sequelize.getQueryInterface();
      await fc.assert(
        fc.asyncProperty(identifier(), async (name) => {
          await queryInterface.createSequence(name, { start: 3 });
          expect(await names(client, schema)).toEqual([name]);
          expect(await queryInterface.nextval(name)).toBe('3');
          expect(await queryInterface.setval({ tableName: name, schema }, 9)).toBe('9');
          await queryInterface.alterSequence(name, { restartWith: 1 });
          await queryInterface.dropSequence(name);
          expect(await names(client, schema)).toEqual([]);
        }),
        { ...propertyParameters(), numRuns: 30 },
      );
      for (const payload of PAYLOADS) {
        const created = await settle(
          queryInterface.createSequence(payload, { ownedBy: { table: 'canary', column: payload } }),
        );
        expect(syntaxError(created)).toBe(false);
        expect(syntaxError(await settle(queryInterface.nextval(payload)))).toBe(false);
        await settle(queryInterface.dropSequence(payload, { ifExists: true }));
      }
    }));

  it('rejects payloads in sequence data types and numbers before sending SQL', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        await expect(
          queryInterface.createSequence('s', { dataType: payload as never }),
        ).rejects.toThrow(/data type/);
        await expect(
          queryInterface.createSequence('s', { start: payload as never }),
        ).rejects.toThrow(/whole number/);
        await expect(
          queryInterface.alterSequence('s', { restartWith: payload as never }),
        ).rejects.toThrow(/whole number/);
        await expect(queryInterface.setval('s', payload as never)).rejects.toThrow(/./);
      }
    }));

  it('quotes extension names and schemas and escapes versions', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        for (const result of [
          await settle(queryInterface.createExtension(payload)),
          await settle(queryInterface.createExtension('pg_trgm', { schema: payload })),
          await settle(queryInterface.createExtension('pg_trgm', { version: payload })),
          await settle(queryInterface.dropExtension(payload, { ifExists: true })),
        ]) {
          expect(syntaxError(result)).toBe(false);
        }
      }
    }));
});
