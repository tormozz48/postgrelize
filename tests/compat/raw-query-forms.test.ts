import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const message = (run: () => Promise<unknown>): Promise<string> =>
  run().then(
    () => 'fulfilled',
    (error: Error) => error.message,
  );

describe('compat: sequelize.query statement forms and parameter errors', () => {
  it('accepts tagged objects and class instances with query, values and bind', () =>
    expectSameResult('', async (lib, sequelize) => {
      class Statement {
        values = [1, 2];
        get query() {
          return 'select ? as foo, ? as bar';
        }
      }
      const options = { type: lib.QueryTypes.SELECT };
      return {
        values: await sequelize.query(
          { query: 'select ? as foo, ? as bar', values: [1, 2] } as never,
          options,
        ),
        bind: await sequelize.query(
          { query: 'select $1::int as foo, $2::int as bar', bind: [1, 2] } as never,
          options,
        ),
        instance: await sequelize.query(new Statement() as never, options),
      };
    }));

  it('rejects conflicting replacements and bind with the v6 messages', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const q = (sql: unknown, options: object) =>
        message(() => sequelize.query(sql as never, { raw: true, ...options } as never));
      return {
        valuesAndReplacements: await q(
          { query: 'select ? as foo', values: [1] },
          { replacements: [1] },
        ),
        sqlBindAndOptionsBind: await q({ query: 'select $1 as foo', bind: [1] }, { bind: [1] }),
        replacementsAndBind: await q('select $1 as foo', { bind: [1], replacements: [1] }),
        sqlBindAndValues: await q({ query: 'select $1 as foo', bind: [1], values: [1] }, {}),
        sqlBindAndReplacements: await q(
          { query: 'select $1 as foo', bind: [1] },
          { replacements: [1] },
        ),
        valuesAndBind: await q({ query: 'select ? as foo', values: [1] }, { bind: [1] }),
      };
    }));

  it('reports missing and malformed replacements and bind parameters with the v6 messages', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const q = (sql: string, options: object) =>
        message(() => sequelize.query(sql, { raw: true, ...options } as never));
      return {
        missingReplacement: await q('select :one as foo, :two as bar, :three as baz', {
          replacements: { one: 1, two: 2 },
        }),
        numberReplacements: await q('select :one as foo', { replacements: 2 }),
        stringReplacements: await q('select :one as foo', { replacements: 'foobar' }),
        emptyReplacements: await q('select :one as foo', { replacements: {} }),
        bufferReplacements: await q('select :one as foo', { replacements: Buffer.from([1]) }),
        bindZero: await q('select $1 as foo, $0 as bar', { bind: [1, 2] }),
        bindLeadingZero: await q('select $1 as foo, $01 as bar', { bind: [1, 2] }),
        bindMissingIndex: await q('select $1 as foo, $2 as bar, $3 as baz', { bind: [1, 2] }),
        bindMissingName: await q('select $one as foo, $three as bar', { bind: { one: 1 } }),
        bindNumber: await q('select $one as foo', { bind: 2 }),
        bindEmpty: await q('select $one as foo', { bind: {} }),
      };
    }));
});
