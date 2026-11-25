import { expect, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Query = (sql: unknown, options?: unknown) => Promise<unknown>;

// Every model query goes through `sequelize.query` in v6, an overridable instance method; ddt wraps it
// to prefix a route comment to the SQL.
it('a wrapper of sequelize.query sees the SQL of model and instance queries and can change it', async () => {
  const result = (await expectSameResult('', async (lib, sequelize) => {
    const M = sequelize.define('QM', { name: lib.DataTypes.STRING, n: lib.DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    const seen: string[] = [];
    const original = sequelize.query.bind(sequelize) as Query;
    (sequelize as unknown as { query: Query }).query = (sql, options) => {
      // v6 hands statements with binds over as `{ query, bind }`, the others as strings
      const tagged = typeof sql === 'object' && sql !== null;
      const text = tagged ? (sql as { query: string }).query : String(sql);
      seen.push(text);
      const prefixed = `/* route:test */ ${text}`;
      return original(tagged ? { ...(sql as object), query: prefixed } : prefixed, options);
    };
    const row = await M.create({ name: 'a', n: 1 } as never);
    const found = await M.findAll({ where: { name: 'a' } });
    await M.update({ n: 2 } as never, { where: { name: 'a' } });
    await row.update({ n: 3 } as never);
    const count = await M.count();
    await row.destroy();
    const kinds = ['INSERT', 'SELECT', 'UPDATE', 'DELETE'].map((verb) =>
      seen.some((text) => text.toUpperCase().includes(verb)),
    );
    return { found: found.length, count, kinds };
  })) as { found: number; count: number; kinds: boolean[] };
  expect(result).toEqual({ found: 1, count: 1, kinds: [true, true, true, true] });
});
