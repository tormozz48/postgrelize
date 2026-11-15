import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DataTypes, Op, cast, col, type Sequelize } from '../../../src/index.ts';
import {
  PAYLOADS,
  identifier,
  propertyParameters,
  settle,
  withCanary,
} from '../../support/injection.ts';

const defineNote = async (sequelize: Sequelize) => {
  const Note = sequelize.define('Note', { body: DataTypes.TEXT }, { timestamps: false });
  await Note.sync();
  return Note;
};

describe('payloads in set operations and WITH TIES', () => {
  it('values inside operands of UNION / INTERSECT / EXCEPT stay bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.bulkCreate(PAYLOADS.map((body) => ({ body })));
      for (const payload of PAYLOADS) {
        const equal = Note.subquery({ attributes: ['id'], where: { body: payload } });
        const other = Note.subquery({ attributes: ['id'], where: { body: { [Op.ne]: payload } } });
        expect(await Note.count({ source: equal.union(other) })).toBe(PAYLOADS.length);
        expect(await Note.count({ source: equal.intersect(other) })).toBe(0);
        expect(await Note.count({ source: equal.except(other) })).toBe(1);
      }
    }));

  it('WITH TIES keeps the fetch count bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.bulkCreate(PAYLOADS.map((body) => ({ body })));
      const rows = await Note.findAll({
        where: { body: { [Op.in]: PAYLOADS } },
        order: [['id', 'ASC']],
        limit: 2,
        withTies: true,
      });
      expect(rows).toHaveLength(2);
    }));
});

type Row = Record<string, unknown>;

describe('payloads in FROM sources', () => {
  it('VALUES cells and function arguments stay bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.bulkCreate(PAYLOADS.map((body) => ({ body })));
      for (const payload of PAYLOADS) {
        const found = await Note.findAll({
          attributes: ['body'],
          from: { v: { values: { columns: ['text'], rows: [[cast(payload, 'text')]] } } },
          where: { body: col('v.text') },
          raw: true,
        });
        expect((found as unknown as Row[]).map((row) => row['body'])).toEqual([payload]);
        const fnRows = await Note.findAll({
          attributes: ['body'],
          from: { u: { function: 'unnest', args: [cast([payload], 'text[]')], columns: ['t'] } },
          where: { body: col('u.t') },
          raw: true,
        });
        expect(fnRows).toHaveLength(1);
      }
    }));

  it('function names, column aliases and source aliases are quoted identifiers', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.create({ body: 'x' });
      await fc.assert(
        fc.asyncProperty(identifier(), identifier(), async (alias, column) => {
          fc.pre(!alias.includes('.') && !column.includes('.'));
          const outcome = await settle(
            Note.findAll({
              from: { [alias]: { values: { columns: [column], rows: [[1]] } } },
              raw: true,
            }),
          );
          expect(outcome).not.toBeInstanceOf(Error);
        }),
        propertyParameters(),
      );
      for (const payload of PAYLOADS.slice(0, 15)) {
        const outcome = await settle(
          Note.findAll({ from: { g: { function: payload, args: [], columns: ['a'] } } }),
        );
        expect((outcome as { original?: { code?: string } }).original?.code).toBe('42883');
      }
    }));

  it('TABLESAMPLE keeps method on an allowlist and numbers bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      for (const payload of PAYLOADS) {
        const method = payload as never;
        await expect(Note.findAll({ sample: { method, percent: 10 } })).rejects.toThrow(
          'Invalid TABLESAMPLE method',
        );
      }
      await expect(
        Note.findAll({ sample: { method: 'SYSTEM', percent: Number.NaN } }),
      ).rejects.toThrow('0 to 100');
      expect(
        await Note.findAll({ sample: { method: 'bernoulli' as never, percent: 100, seed: 1 } }),
      ).toEqual([]);
    }));

  it('JSON_TABLE documents, paths and column names cannot break out', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.create({ body: 'x' });
      for (const payload of PAYLOADS.slice(0, 20)) {
        const outcome = await settle(
          Note.findAll({
            from: {
              j: {
                jsonTable: {
                  doc: { [payload]: payload },
                  path: payload,
                  columns: [{ name: payload, type: 'text', path: payload }],
                },
              },
            },
            raw: true,
          }),
        );
        // The payload is parsed as a jsonpath (servers before 17 reject JSON_TABLE itself): never as SQL.
        const message = (outcome as { original?: { message?: string } }).original?.message ?? '';
        expect(message).toMatch(/jsonpath|at or near "COLUMNS"/);
      }
      await expect(
        Note.findAll({
          from: {
            j: { jsonTable: { doc: {}, path: '$', columns: [{ name: 'a', type: 'int); --' }] } },
          },
        }),
      ).rejects.toThrow('Invalid cast type');
    }));
});
