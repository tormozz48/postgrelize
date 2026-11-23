import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: sequelize.query replacements are written into the SQL', () => {
  it('runs several statements with named and positional replacements', () =>
    expectSameResult('', async (lib, sequelize) => {
      await sequelize.query(
        'CREATE TABLE multi (id integer, note text, flag boolean); INSERT INTO multi VALUES (:id, :note, :flag); INSERT INTO multi VALUES (:id2, :note2, NULL)',
        { replacements: { id: 1, note: "it's", flag: true, id2: 2, note2: 'a\\b' } },
      );
      await sequelize.query(
        'UPDATE multi SET note = ? WHERE id = ?; DELETE FROM multi WHERE id = ?',
        {
          replacements: ['changed', 1, 2],
        },
      );
      return sequelize.query('SELECT * FROM multi ORDER BY id', { type: lib.QueryTypes.SELECT });
    }));

  it('substitutes strings, numbers, booleans, null, dates and lists like v6', () =>
    expectSameResult('', async (lib, sequelize) => {
      const run = (sql: string, replacements: unknown) =>
        sequelize.query(sql, { type: lib.QueryTypes.SELECT, replacements } as never);
      return {
        text: await run('SELECT :a AS a, :b AS b', { a: "x'; DROP TABLE t; --", b: 'q"r' }),
        numbers: await run('SELECT :i AS i, :f AS f, :n AS n', { i: 1, f: 1.5, n: -2 }),
        boolNull: await run('SELECT :t AS t, :f AS f, :n AS n', { t: true, f: false, n: null }),
        list: await run('SELECT 2 AS two WHERE 2 IN (:ids)', { ids: [1, 2, 3] }),
        strings: await run("SELECT x FROM unnest(ARRAY['a','b','c']) AS x WHERE x IN (:v)", {
          v: ['a', 'c'],
        }),
        date: await run("SELECT (:d)::timestamptz = '2020-01-02T03:04:05Z'::timestamptz AS same", {
          d: new Date('2020-01-02T03:04:05.000Z'),
        }),
        positional: await run('SELECT ? AS a, ? AS b, ? AS a2', ['1', 2, '1']),
        typed: await run('SELECT pg_typeof(:n)::text AS n, pg_typeof(:t)::text AS t', {
          n: 1,
          t: true,
        }),
      };
    }));
});
