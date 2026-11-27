import { describe, expect, it } from 'vitest';
import { DataTypes, col, fn } from '../../../src/index.ts';
import { PAYLOADS, settle, withCanary } from '../../support/injection.ts';

const syntaxError = (result: unknown): boolean =>
  (result as { original?: { code?: string } } | undefined)?.original?.code === '42601';

describe('index fields cannot break out of their quoting', () => {
  it('quotes index names, columns and collations, and rejects payload operator classes', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const named = await settle(
          queryInterface.addIndex('canary', {
            name: payload,
            fields: [{ name: 'id', collate: payload }],
          }),
        );
        expect(syntaxError(named)).toBe(false);
        const column = await settle(queryInterface.addIndex('canary', [payload]));
        expect(syntaxError(column)).toBe(false);
        for (const options of [
          { fields: [{ name: 'id', operator: payload }] },
          { using: payload, fields: ['id'] },
        ]) {
          const guarded = await settle(
            queryInterface.addIndex('canary', { name: 'i', ...options }),
          );
          expect(syntaxError(guarded)).toBe(false);
        }
      }
    }));

  it('coerces nulls and order to their keywords', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const result = await settle(
          queryInterface.addIndex('canary', {
            name: 'i_nulls',
            fields: [{ name: 'id', nulls: payload as never, order: payload as never }],
          }),
        );
        expect(syntaxError(result)).toBe(false);
        await settle(queryInterface.removeIndex('canary', 'i_nulls'));
      }
    }));
});

describe('constraint names, operators and methods cannot break out', () => {
  it('quotes constraint names and validateConstraint arguments', () =>
    withCanary(async ({ sequelize, schema }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const added = await settle(
          queryInterface.addConstraint('canary', {
            type: 'check',
            name: payload,
            fields: ['id'],
            where: { id: 1 },
            notValid: true,
          }),
        );
        expect(syntaxError(added)).toBe(false);
        expect(
          syntaxError(await settle(queryInterface.validateConstraint('canary', payload))),
        ).toBe(false);
        expect(
          syntaxError(
            await settle(
              queryInterface.validateConstraint({ tableName: payload, schema }, payload),
            ),
          ),
        ).toBe(false);
        await settle(queryInterface.removeConstraint('canary', payload));
      }
    }));

  it('rejects payload operators and methods before sending SQL; quotes element columns', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const base = { type: 'exclude' as const, name: 'e' };
        await expect(
          queryInterface.addConstraint('canary', {
            ...base,
            exclude: [{ name: 'id', with: payload }],
          }),
        ).rejects.toThrow(/Invalid operator/);
        const method = await settle(
          queryInterface.addConstraint('canary', {
            ...base,
            using: payload,
            exclude: [{ name: 'id', with: '=' }],
          }),
        );
        expect(syntaxError(method)).toBe(false);
        for (const element of [
          { name: payload, with: '=' },
          { name: 'id', collate: payload, with: '=' },
          { name: 'id', operator: payload, with: '=' },
        ]) {
          const result = await settle(
            queryInterface.addConstraint('canary', { ...base, exclude: [element] }),
          );
          expect(syntaxError(result)).toBe(false);
          await settle(queryInterface.removeConstraint('canary', 'e'));
        }
      }
    }));

  it('quotes foreign key field lists and referenced fields', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const result = await settle(
          queryInterface.addConstraint('canary', {
            type: 'foreign key',
            name: payload,
            fields: [payload, 'id'],
            references: { table: 'canary', field: payload, fields: [payload, 'id'] },
            enforced: undefined,
          }),
        );
        expect(syntaxError(result)).toBe(false);
      }
    }));
});

describe('partition names, keys and bounds cannot break out', () => {
  it('quotes partition names and renders bound values as literals', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable(
        'parted',
        { id: DataTypes.INTEGER, label: DataTypes.TEXT },
        { partitionBy: { strategy: 'list', columns: ['label'] } },
      );
      for (const payload of PAYLOADS) {
        const created = await settle(
          queryInterface.createPartition('parted', payload, { in: [payload] }),
        );
        expect(syntaxError(created)).toBe(false);
        const attached = await settle(
          queryInterface.attachPartition('parted', payload, { in: [payload] }),
        );
        expect(syntaxError(attached)).toBe(false);
        expect(syntaxError(await settle(queryInterface.detachPartition('parted', payload)))).toBe(
          false,
        );
        await settle(queryInterface.dropTable(payload));
      }
    }));

  it('rejects payload strategies, moduli and keys before sending SQL', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        await expect(
          queryInterface.createTable(
            'p1',
            { id: DataTypes.INTEGER },
            { partitionBy: { strategy: payload as never, columns: ['id'] } },
          ),
        ).rejects.toThrow(/partition strategy/);
        await expect(
          queryInterface.createPartition('canary', 'c', {
            modulus: payload as never,
            remainder: 0,
          }),
        ).rejects.toThrow(/whole number/);
        const keyed = await settle(
          queryInterface.createTable(
            'p2',
            { id: DataTypes.INTEGER },
            {
              partitionBy: {
                strategy: 'range',
                columns: [{ name: 'id', collate: payload, operator: 'int4_ops' }, payload],
              },
            },
          ),
        );
        expect(syntaxError(keyed)).toBe(false);
        await settle(queryInterface.dropTable('p2'));
      }
    }));

  it('fn() arguments of an index field are escaped literals', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('indexed', { name: DataTypes.TEXT });
      for (const [index, payload] of PAYLOADS.entries()) {
        const outcome = await settle(
          queryInterface.addIndex('indexed', [fn('coalesce', col('name'), payload)], {
            name: `indexed_${index}`,
          }),
        );
        expect(syntaxError(outcome)).toBe(false);
      }
    }));
});
