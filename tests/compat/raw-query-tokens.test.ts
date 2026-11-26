import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: raw query tokens', () => {
  it('leaves a dollar inside an identifier alone', () =>
    expectSameResult('', (_lib, sequelize) =>
      sequelize.query('SELECT $one::int AS foo$bar, 1 AS a$1', {
        type: 'SELECT' as never,
        bind: { one: 1 },
      }),
    ));

  it('renders nested array replacements as rows', () =>
    expectSameResult('', async (_lib, sequelize) => [
      await sequelize.query('SELECT * FROM (VALUES ?) AS t (a, b) ORDER BY a', {
        type: 'SELECT' as never,
        replacements: [
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
        ],
      }),
      await sequelize.query('SELECT 1 AS x WHERE (1, 2) IN (:rows)', {
        type: 'SELECT' as never,
        replacements: { rows: [[1, 2]] },
      }),
    ]));
});
