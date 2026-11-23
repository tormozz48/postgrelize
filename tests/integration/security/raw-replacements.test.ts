import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QueryTypes } from '../../../src/index.ts';
import { PAYLOADS, propertyParameters, textValue, withCanary } from '../../support/injection.ts';

describe('sequelize.query replacements are escaped into the SQL text (ADR-036)', () => {
  it('keeps every payload inside its literal, named and positional', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS) {
        const named = await sequelize.query('SELECT :v::text AS v', {
          type: QueryTypes.SELECT,
          replacements: { v: payload },
        });
        expect(named).toEqual([{ v: payload }]);
        const positional = await sequelize.query("SELECT ?::text AS v, 'x' AS w", {
          type: QueryTypes.SELECT,
          replacements: [payload],
        });
        expect(positional).toEqual([{ v: payload, w: 'x' }]);
        const list = await sequelize.query('SELECT :v::text AS v WHERE :v::text IN (:vs)', {
          type: QueryTypes.SELECT,
          replacements: { v: payload, vs: [payload, 'other'] },
        });
        expect(list).toEqual([{ v: payload }]);
      }
    }));

  it('round-trips arbitrary strings, also inside arrays and JSON', () =>
    withCanary(async ({ sequelize }) => {
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (value, other) => {
          const [row] = (await sequelize.query(
            'SELECT :v::text AS v, ARRAY[:list]::text[] AS list, (:json)::jsonb AS json',
            {
              type: QueryTypes.SELECT,
              replacements: { v: value, list: [value, other], json: { k: value } },
            },
          )) as { v: string; list: string[]; json: { k: string } }[];
          expect(row).toEqual({ v: value, list: [value, other], json: { k: value } });
        }),
        propertyParameters(),
      );
    }));

  it('does not substitute a placeholder that appears inside a value', () =>
    withCanary(async ({ sequelize }) => {
      const rows = await sequelize.query('SELECT :a::text AS a, :b::text AS b', {
        type: QueryTypes.SELECT,
        replacements: { a: ':b ? $1', b: 'B' },
      });
      expect(rows).toEqual([{ a: ':b ? $1', b: 'B' }]);
    }));

  it('rejects a NUL character instead of changing the value', () =>
    withCanary(async ({ sequelize }) => {
      await expect(sequelize.query('SELECT ?', { replacements: ['a\0b'] })).rejects.toThrow(/NUL/);
    }));

  it('keeps bind parameters bound', () =>
    withCanary(async ({ sequelize }) => {
      const rows = await sequelize.query('SELECT $1::text AS v', {
        type: QueryTypes.SELECT,
        bind: ["x'; CREATE TABLE pwned (); --"],
      });
      expect(rows).toEqual([{ v: "x'; CREATE TABLE pwned (); --" }]);
    }));

  it('runs several statements with replacements in one call', () =>
    withCanary(async ({ sequelize }) => {
      await sequelize.query(
        'CREATE TABLE multi (id integer, note text); INSERT INTO multi VALUES (:id, :note); INSERT INTO multi VALUES (:id2, :note2)',
        { replacements: { id: 1, note: "it's", id2: 2, note2: 'a\\b' } },
      );
      const rows = await sequelize.query('SELECT id, note FROM multi ORDER BY id', {
        type: QueryTypes.SELECT,
      });
      expect(rows).toEqual([
        { id: 1, note: "it's" },
        { id: 2, note: 'a\\b' },
      ]);
    }));
});
