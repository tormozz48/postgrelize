import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: $$ in a query with bind', () => {
  it('stands for a single $ in string literals', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const select = async (sql: string, bind?: unknown): Promise<unknown> =>
        sequelize.query(sql, {
          type: 'SELECT' as never,
          ...(bind === undefined ? {} : { bind: bind as never }),
        });
      return [
        await select("select $1::int as foo, '$$ / $$1' as bar", [1]),
        await select("select $one::int as foo, '$$ / $$one' as bar", { one: 2 }),
        await select("select '$$' as bar", []),
        await select("select '$$ and a$$' as bar"),
      ];
    }));
});
