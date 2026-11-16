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
        { ...propertyParameters(), numRuns: 15 },
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

  it('guards function and trigger names, types, keywords and quotes literal arguments', () =>
    withCanary(async ({ sequelize, client }) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createFunction('benign', [], 'trigger', 'plpgsql', 'RETURN NEW;');
      for (const payload of PAYLOADS.filter((value) => !/^[A-Za-z_]\w*$/.test(value))) {
        for (const attempt of [
          () => queryInterface.createFunction(payload, [], 'integer', 'plpgsql', 'RETURN 1;'),
          () =>
            queryInterface.createFunction(
              'f',
              [{ type: payload }],
              'integer',
              'plpgsql',
              'RETURN 1;',
            ),
          () =>
            queryInterface.createFunction(
              'f',
              [{ type: 'int', name: payload }],
              'integer',
              'plpgsql',
              'RETURN 1;',
            ),
          () =>
            queryInterface.createFunction(
              'f',
              [{ type: 'int', direction: payload }],
              'integer',
              'plpgsql',
              'RETURN 1;',
            ),
          () => queryInterface.createFunction('f', [], payload, 'plpgsql', 'RETURN 1;'),
          () => queryInterface.createFunction('f', [], 'integer', payload, 'RETURN 1;'),
          () =>
            queryInterface.createFunction('f', [], 'integer', 'plpgsql', 'RETURN 1;', [payload]),
          () =>
            queryInterface.createFunction('f', [], 'integer', 'plpgsql', 'RETURN 1;', [], {
              variables: [{ name: payload, type: 'int' }],
            }),
          () => queryInterface.dropFunction(payload, []),
          () => queryInterface.renameFunction('benign', [], payload),
          () => queryInterface.createTrigger('canary', 't', payload as never, ['insert'], 'benign'),
          () => queryInterface.createTrigger('canary', 't', 'after', [payload as never], 'benign'),
          () => queryInterface.createTrigger('canary', 't', 'after', ['insert'], payload),
          () =>
            queryInterface.createTrigger(
              'canary',
              't',
              'after',
              ['insert'],
              'benign',
              [],
              [payload],
            ),
        ]) {
          await expect(attempt()).rejects.toThrow(/./);
        }
        const bound = await settle(
          queryInterface.createTrigger(
            'canary',
            payload,
            'after',
            ['insert'],
            'benign',
            [payload, 1],
            ['FOR EACH ROW'],
          ),
        );
        expect({ payload, syntaxError: syntaxError(bound) }).toEqual({
          payload,
          syntaxError: false,
        });
        await queryInterface.dropTrigger('canary', payload, { ifExists: true });
        const tables = await queryInterface
          .createTrigger(
            { tableName: payload, schema: 'public' },
            't',
            'after',
            ['insert'],
            'benign',
          )
          .catch((error: unknown) => error);
        expect(syntaxError(tables)).toBe(false);
      }
      expect((await client.query("SELECT 1 FROM pg_proc WHERE proname = 'f'")).rowCount).toBe(0);
    }));

  it('quotes arbitrary trigger and exact function names', () =>
    withCanary(async ({ sequelize, client, schema }) => {
      const queryInterface = sequelize.getQueryInterface();
      await fc.assert(
        fc.asyncProperty(identifier(), identifier(), async (fn, trigger) => {
          await queryInterface.createFunction(
            { name: fn, schema },
            [],
            'trigger',
            'plpgsql',
            'RETURN NEW;',
          );
          await queryInterface.createTrigger(
            'canary',
            trigger,
            'before',
            ['insert'],
            { name: fn, schema },
            [fn],
          );
          const found = await client.query('SELECT 1 FROM pg_trigger WHERE tgname = $1', [trigger]);
          expect(found.rowCount).toBe(1);
          await queryInterface.dropTrigger('canary', trigger);
          await queryInterface.dropFunction({ name: fn, schema }, []);
        }),
        { ...propertyParameters(), numRuns: 15 },
      );
    }));

  it('quotes view names and columns and guards view keywords', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      await fc.assert(
        fc.asyncProperty(identifier(), identifier(), async (name, column) => {
          await queryInterface.createView(name, 'SELECT 1 AS one', { columns: [column] });
          await queryInterface.createMaterializedView(`m_${name}`.slice(0, 60), 'SELECT 1 AS one', {
            columns: [column],
          });
          await queryInterface.refreshMaterializedView(`m_${name}`.slice(0, 60));
          await queryInterface.dropMaterializedView(`m_${name}`.slice(0, 60));
          await queryInterface.dropView(name);
        }),
        { ...propertyParameters(), numRuns: 15 },
      );
      for (const payload of PAYLOADS.filter((value) => !/^[A-Za-z_]\w*$/.test(value))) {
        await expect(
          queryInterface.createView('v', 'SELECT 1', { checkOption: payload as never }),
        ).rejects.toThrow(/check option/);
        await expect(
          queryInterface.createMaterializedView('m', 'SELECT 1', { using: payload }),
        ).rejects.toThrow(/access method/);
        expect(syntaxError(await settle(queryInterface.createView(payload, 'SELECT 1')))).toBe(
          false,
        );
        expect(syntaxError(await settle(queryInterface.refreshMaterializedView(payload)))).toBe(
          false,
        );
        expect(
          syntaxError(
            await settle(
              queryInterface.dropView({ tableName: payload, schema: payload }, { ifExists: true }),
            ),
          ),
        ).toBe(false);
        await queryInterface.dropView(payload, { ifExists: true });
      }
    }));

  it('quotes policy names and roles, allowlists commands and kinds, escapes where-object values', () =>
    withCanary(async ({ sequelize, client }) => {
      const queryInterface = sequelize.getQueryInterface();
      await client.query('CREATE TABLE labels (label text)');
      await fc.assert(
        fc.asyncProperty(identifier(), identifier(), async (policy, role) => {
          const created = await settle(
            queryInterface.createPolicy('labels', policy, { roles: [role, 'public'] }),
          );
          const code = (created as { original?: { code?: string } } | undefined)?.original?.code;
          expect(code === undefined || code === '42704').toBe(true);
        }),
        { ...propertyParameters(), numRuns: 15 },
      );
      for (const payload of PAYLOADS.filter((value) => !/^[A-Za-z_]\w*$/.test(value))) {
        await expect(
          queryInterface.createPolicy('labels', 'p', { command: payload as never }),
        ).rejects.toThrow(/command/);
        await expect(
          queryInterface.createPolicy('labels', 'p', { kind: payload as never }),
        ).rejects.toThrow(/kind/);
        await queryInterface.createPolicy('labels', payload, { using: { label: payload } });
        const stored = await client.query('SELECT qual FROM pg_policies WHERE policyname = $1', [
          payload,
        ]);
        expect(stored.rowCount).toBe(1);
        await queryInterface
          .alterPolicy('labels', payload, { withCheck: { label: payload } })
          .catch((error: unknown) => error);
        await queryInterface.dropPolicy('labels', payload);
        expect(
          syntaxError(
            await settle(
              queryInterface.enableRowLevelSecurity({ tableName: payload, schema: payload }),
            ),
          ),
        ).toBe(false);
        expect(
          syntaxError(await settle(queryInterface.alterPolicy('labels', 'x', { rename: payload }))),
        ).toBe(false);
      }
    }));
});
