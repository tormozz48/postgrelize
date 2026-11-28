import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cast, col, where } from '../../../src/index.ts';
import {
  PAYLOADS,
  identifier,
  propertyParameters,
  settle,
  withCanary,
} from '../../support/injection.ts';

const rowsOf = (value: string) => ({
  function: 'unnest',
  args: [cast([value], 'text[]')],
  columns: ['v'],
});

describe('payloads in model-less queries and joins', () => {
  it('source values, where, join conditions and limits stay bound', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS) {
        const rows = await sequelize.select({
          from: { a: rowsOf(payload) },
          joins: { b: { source: rowsOf(payload), on: where(col('b.v'), col('a.v')) } },
          where: { '$a.v$': payload },
        });
        expect(rows).toEqual([{ v: payload }]);
      }
    }));

  it('rejects join types, order directions and non-numeric limits that carry SQL', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS) {
        const from = { a: rowsOf('x') };
        await expect(
          sequelize.select({
            from,
            joins: { b: { type: payload as 'left', source: rowsOf('x') } },
          }),
        ).rejects.toThrow('Invalid join type');
        await expect(sequelize.select({ from, order: [['a.v', payload]] })).rejects.toThrow(
          'Invalid order direction',
        );
        await settle(sequelize.select({ from, limit: payload as unknown as number }));
      }
    }));

  it('aliases and selected column names are quoted identifiers', () =>
    withCanary(async ({ sequelize }) => {
      await fc.assert(
        fc.asyncProperty(identifier(), identifier(), async (alias, name) => {
          fc.pre(!alias.includes('.') && !name.includes('.') && name !== '*' && alias !== name);
          const outcome = await settle(
            sequelize.select({
              from: { [alias]: rowsOf('x') },
              joins: { [name]: { source: rowsOf('x') } },
              attributes: [[`${alias}.v`, name]],
            }),
          );
          expect((outcome as { original?: { code?: string } }).original?.code).not.toBe('42601');
        }),
        propertyParameters(),
      );
    }));
});
